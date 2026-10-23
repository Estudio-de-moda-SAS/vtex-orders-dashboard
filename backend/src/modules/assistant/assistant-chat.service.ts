import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AssistantLogsRepository } from '../database/repositories/assistant-logs.repository';
import { AssistantToolsRegistry } from './assistant-tools.registry';
import { SYSTEM_MANUAL_PROMPT } from './prompts/system-manual';
import { ASSISTANT_LLM_PROVIDER } from './providers/assistant-llm-provider.factory';
import { AssistantLlmProvider, ChatMessage } from './providers/assistant-llm-provider.interface';

/**
 * Orquesta el chat SIN conocer de qué proveedor viene el modelo —
 * `AssistantLlmProvider` (inyectado según `ASSISTANT_PROVIDER`, ver
 * `assistant-llm-provider.factory.ts`) corre toda la conversación,
 * incluido su propio loop de tool use; acá solo se arma el prompt de
 * sistema + las herramientas en su forma neutral, se delega, y se
 * registra el resultado en `assistant_logs` — igual sin importar si
 * respondió Anthropic u OpenAI.
 */
@Injectable()
export class AssistantChatService {
  private readonly logger = new Logger(AssistantChatService.name);
  private readonly systemPrompt: string;
  private readonly providerName: string;
  private readonly modelLabel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly toolsRegistry: AssistantToolsRegistry,
    private readonly logsRepository: AssistantLogsRepository,
    @Inject(ASSISTANT_LLM_PROVIDER) private readonly provider: AssistantLlmProvider | null,
  ) {
    this.systemPrompt = SYSTEM_MANUAL_PROMPT;
    this.providerName = this.configService.get<string>('app.assistant.provider', 'openai');
    this.modelLabel =
      this.providerName === 'anthropic'
        ? this.configService.get<string>('app.assistant.model', 'claude-opus-5-5')
        : this.configService.get<string>('app.assistant.openaiModel', 'gpt-5.4-mini');
  }

  async *streamChat(question: string, history: ChatMessage[]): AsyncGenerator<string> {
    if (!this.provider) {
      const envVar = this.providerName === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      const message = `El asistente no está configurado todavía (falta ${envVar} para el proveedor "${this.providerName}") — avísale al administrador.`;
      yield message;
      await this.logsRepository.insert({
        mode: null,
        questionText: question,
        toolCalls: [],
        answerText: null,
        model: this.modelLabel,
        effort: null,
        inputTokens: null,
        outputTokens: null,
        latencyMs: 0,
        errorMessage: message,
      });
      return;
    }

    const startedAt = Date.now();
    const tools = this.toolsRegistry.getToolDefinitions();
    let finalText = '';
    let errorMessage: string | null = null;
    let toolCalls: unknown[] = [];
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    try {
      const conversation = this.provider.streamConversation({
        systemPrompt: this.systemPrompt,
        tools,
        history,
        question,
        executeTool: (name, input) => this.toolsRegistry.execute(name, input),
      });

      let next = await conversation.next();
      while (!next.done) {
        finalText += next.value;
        yield next.value;
        next = await conversation.next();
      }

      toolCalls = next.value.toolCalls;
      inputTokens = next.value.inputTokens || null;
      outputTokens = next.value.outputTokens || null;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'ocurrió un error inesperado.';
      this.logger.error('Falla en el chat del asistente', error as Error);
      yield `\n\n(Hubo un problema hablando con el asistente: ${errorMessage})`;
    }

    await this.logsRepository.insert({
      mode: null,
      questionText: question,
      toolCalls,
      answerText: finalText || null,
      model: this.modelLabel,
      effort: this.providerName === 'anthropic' ? this.configService.get<string>('app.assistant.effort', 'medium') : null,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      errorMessage,
    });
  }
}
