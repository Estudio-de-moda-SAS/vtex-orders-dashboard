import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';

import { AssistantToolError } from '../assistant-tool.error';
import { AssistantLlmProvider, AssistantLlmRunResult, ToolCallLogEntry } from './assistant-llm-provider.interface';

/**
 * No más de 8 idas y vueltas de herramientas por pregunta — una pregunta
 * legítima rara vez necesita más de 2-3 (resolver fecha + traer datos +
 * quizás comparar); este techo es solo para cortar un loop del modelo que
 * nunca llega a una respuesta final, no un límite que se espera alcanzar
 * en uso normal.
 */
const MAX_TOOL_ITERATIONS = 8;
const MAX_TOKENS = 4096;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loop manual de tool use sobre la API de Anthropic (ver plan: se eligió
 * esto en vez del helper `tool_runner` del SDK para no introducir `zod`
 * como dependencia nueva — cada herramienta ya valida su input con
 * `class-validator`, ver `AssistantToolsRegistry`). Transmite el texto de
 * la respuesta a medida que llega (consumiendo el stream como async
 * iterable, no con `.on('text', ...)`, para poder `yield` directo desde
 * este generador).
 */
export class AnthropicAssistantProvider implements AssistantLlmProvider {
  private readonly logger = new Logger(AnthropicAssistantProvider.name);
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly effort: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async *streamConversation(
    params: Parameters<AssistantLlmProvider['streamConversation']>[0],
  ): AsyncGenerator<string, AssistantLlmRunResult, void> {
    const { systemPrompt, tools: neutralTools, history, question, executeTool } = params;

    const tools: Anthropic.Tool[] = neutralTools.map((t, i, all) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
      // Caché de prompt: el bloque de sistema y la lista de herramientas no cambian
      // entre preguntas — solo se marca el ÚLTIMO para cubrir ambos con un breakpoint.
      ...(i === all.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));

    const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: question }];
    const toolCallsLog: ToolCallLogEntry[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const requestParams: Anthropic.MessageStreamParams = {
          model: this.model,
          max_tokens: MAX_TOKENS,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          tools,
          tool_choice: { type: 'auto' },
          thinking: { type: 'adaptive' },
          output_config: { effort: this.effort as Anthropic.OutputConfig['effort'] },
          messages,
        };

        const turn = this.streamOneTurn(requestParams);
        let next = await turn.next();
        while (!next.done) {
          yield next.value;
          next = await turn.next();
        }
        const finalMessage = next.value;

        totalInputTokens += finalMessage.usage.input_tokens;
        totalOutputTokens += finalMessage.usage.output_tokens;

        if (finalMessage.stop_reason !== 'tool_use') break;

        const toolUseBlocks = finalMessage.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );
        if (toolUseBlocks.length === 0) break;

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
            try {
              const result = await executeTool(block.name, block.input);
              toolCallsLog.push({ name: block.name, input: block.input, output: result });
              return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
            } catch (error) {
              const message = error instanceof AssistantToolError ? error.message : 'Error interno ejecutando la herramienta.';
              toolCallsLog.push({ name: block.name, input: block.input, error: message });
              if (!(error instanceof AssistantToolError)) {
                this.logger.error(`Fallo ejecutando la herramienta "${block.name}"`, error as Error);
              }
              return { type: 'tool_result', tool_use_id: block.id, content: message, is_error: true };
            }
          }),
        );

        messages.push({ role: 'assistant', content: finalMessage.content });
        messages.push({ role: 'user', content: toolResults });
      }
    } catch (error) {
      this.logger.error('Falla en el chat del asistente (Anthropic)', error as Error);
      throw new Error(this.describeError(error));
    }

    return { toolCalls: toolCallsLog, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
  }

  /**
   * Consume UN turno de streaming como async iterable (en vez de
   * `.on('text', ...)`) para poder `yield` el texto directo desde acá.
   * Reintenta UNA vez ante `RateLimitError` (con una pausa corta) — otros
   * errores de la API se relanzan tal cual, los maneja `streamConversation`.
   */
  private async *streamOneTurn(params: Anthropic.MessageStreamParams): AsyncGenerator<string, Anthropic.Message, void> {
    try {
      return yield* this.consumeStream(params);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        await sleep(2000);
        return yield* this.consumeStream(params);
      }
      throw error;
    }
  }

  private async *consumeStream(params: Anthropic.MessageStreamParams): AsyncGenerator<string, Anthropic.Message, void> {
    const stream = this.client.messages.stream(params);
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    return await stream.finalMessage();
  }

  private describeError(error: unknown): string {
    if (error instanceof Anthropic.RateLimitError) return 'se alcanzó el límite de uso de la API de Anthropic, intenta de nuevo en un momento.';
    if (error instanceof Anthropic.APIConnectionError) return 'no fue posible conectarse con la API de Anthropic.';
    if (error instanceof Anthropic.APIError) return `la API de Anthropic respondió con un error (${error.status}).`;
    return 'ocurrió un error inesperado hablando con Anthropic.';
  }
}
