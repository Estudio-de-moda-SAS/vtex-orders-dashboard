import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ResponseInput, ResponseInputItem, Tool } from 'openai/resources/responses/responses';

import { AssistantToolError } from '../assistant-tool.error';
import { AssistantLlmProvider, AssistantLlmRunResult, ToolCallLogEntry } from './assistant-llm-provider.interface';

/** Mismo techo que el proveedor de Anthropic — ver su comentario. */
const MAX_TOOL_ITERATIONS = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loop manual de tool use sobre la Responses API de OpenAI (confirmado
 * contra la documentación oficial y los tipos del SDK instalado —
 * `openai@7.x` — en vez de memoria: es la API que OpenAI recomienda hoy
 * para agentes nuevos con tool calling, sucesora de Chat Completions para
 * este caso de uso). Misma forma que `AnthropicAssistantProvider`: un
 * generador async que transmite el texto a medida que llega y devuelve el
 * resumen de uso al terminar.
 */
export class OpenAiAssistantProvider implements AssistantLlmProvider {
  private readonly logger = new Logger(OpenAiAssistantProvider.name);
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async *streamConversation(
    params: Parameters<AssistantLlmProvider['streamConversation']>[0],
  ): AsyncGenerator<string, AssistantLlmRunResult, void> {
    const { systemPrompt, tools: neutralTools, history, question, executeTool } = params;

    const tools: Tool[] = neutralTools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false,
    }));

    const input: ResponseInput = [
      ...history.map((m): ResponseInputItem => ({ role: m.role, content: m.content })),
      { role: 'user', content: question },
    ];

    const toolCallsLog: ToolCallLogEntry[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const requestParams: OpenAI.Responses.ResponseCreateParamsStreaming = {
          model: this.model,
          instructions: systemPrompt,
          tools,
          tool_choice: 'auto',
          input,
          stream: true,
        };

        const turn = this.streamOneTurn(requestParams);
        let next = await turn.next();
        while (!next.done) {
          yield next.value;
          next = await turn.next();
        }
        const finalResponse = next.value;

        totalInputTokens += finalResponse.usage?.input_tokens ?? 0;
        totalOutputTokens += finalResponse.usage?.output_tokens ?? 0;

        const functionCalls = finalResponse.output.filter(
          (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
        );
        if (functionCalls.length === 0) break;

        // `finalResponse.output` trae, en runtime, un campo extra en cada
        // `function_call` (`parsed_arguments`) que el tipo `ResponseFunctionToolCall`
        // no declara y que la API rechaza si se reenvía tal cual ("Unknown
        // parameter: 'input[...].parsed_arguments'") — reconstruimos el ítem con
        // solo los campos que la Responses API acepta de vuelta como input. Los
        // `message` sí son válidos reenviados tal cual (`ResponseOutputMessage` es
        // miembro directo de la unión `ResponseInputItem`).
        for (const item of finalResponse.output) {
          if (item.type === 'function_call') {
            input.push({ type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments });
          } else {
            input.push(item as unknown as ResponseInputItem);
          }
        }

        const toolOutputs = await Promise.all(
          functionCalls.map(async (call): Promise<ResponseInputItem> => {
            let parsedInput: unknown = {};
            try {
              parsedInput = JSON.parse(call.arguments || '{}');
            } catch {
              // argumentos no parseables como JSON — se deja {} y la validación de la
              // herramienta (class-validator) rechaza el input con un mensaje claro.
            }
            try {
              const result = await executeTool(call.name, parsedInput);
              toolCallsLog.push({ name: call.name, input: parsedInput, output: result });
              return { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) };
            } catch (error) {
              const message = error instanceof AssistantToolError ? error.message : 'Error interno ejecutando la herramienta.';
              toolCallsLog.push({ name: call.name, input: parsedInput, error: message });
              if (!(error instanceof AssistantToolError)) {
                this.logger.error(`Fallo ejecutando la herramienta "${call.name}"`, error as Error);
              }
              return { type: 'function_call_output', call_id: call.call_id, output: message };
            }
          }),
        );

        input.push(...toolOutputs);
      }
    } catch (error) {
      this.logger.error('Falla en el chat del asistente (OpenAI)', error as Error);
      throw new Error(this.describeError(error));
    }

    return { toolCalls: toolCallsLog, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
  }

  /**
   * Consume UN turno de streaming como async iterable (`client.responses.stream`
   * ya implementa `AsyncIterable`, mismo patrón que `messages.stream` de
   * Anthropic) y devuelve la respuesta final acumulada vía `finalResponse()`.
   * Reintenta UNA vez ante `RateLimitError`.
   */
  private async *streamOneTurn(
    params: OpenAI.Responses.ResponseCreateParamsStreaming,
  ): AsyncGenerator<string, OpenAI.Responses.Response, void> {
    try {
      return yield* this.consumeStream(params);
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) {
        await sleep(2000);
        return yield* this.consumeStream(params);
      }
      throw error;
    }
  }

  private async *consumeStream(
    params: OpenAI.Responses.ResponseCreateParamsStreaming,
  ): AsyncGenerator<string, OpenAI.Responses.Response, void> {
    const stream = this.client.responses.stream(params);
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        yield event.delta;
      }
    }
    return await stream.finalResponse();
  }

  private describeError(error: unknown): string {
    if (error instanceof OpenAI.RateLimitError) return 'se alcanzó el límite de uso de la API de OpenAI, intenta de nuevo en un momento.';
    if (error instanceof OpenAI.APIConnectionError) return 'no fue posible conectarse con la API de OpenAI.';
    if (error instanceof OpenAI.APIError) return `la API de OpenAI respondió con un error (${error.status}).`;
    return 'ocurrió un error inesperado hablando con OpenAI.';
  }
}
