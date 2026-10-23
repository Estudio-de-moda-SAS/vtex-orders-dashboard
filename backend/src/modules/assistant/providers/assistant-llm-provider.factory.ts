import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';

import { AnthropicAssistantProvider } from './anthropic-assistant.provider';
import { AssistantLlmProvider } from './assistant-llm-provider.interface';
import { OpenAiAssistantProvider } from './openai-assistant.provider';

export const ASSISTANT_LLM_PROVIDER = 'ASSISTANT_LLM_PROVIDER';

/**
 * Elige la implementación concreta según `ASSISTANT_PROVIDER` ('openai' por
 * default — es lo que el usuario puede probar hoy; 'anthropic' queda
 * completamente construido para cuando tenga una clave de pago de
 * Anthropic). Las dos comparten EXACTAMENTE las mismas 6 herramientas
 * (`AssistantToolsRegistry`) — solo cambia qué modelo narra la
 * conversación. `null` si falta la clave del proveedor elegido — el chat
 * responde con un mensaje claro en vez de arrancar roto (ver
 * `AssistantChatService`).
 */
export function createAssistantLlmProvider(configService: ConfigService): AssistantLlmProvider | null {
  const provider = configService.get<string>('app.assistant.provider', 'openai');

  if (provider === 'anthropic') {
    const apiKey = configService.get<string | null>('app.assistant.anthropicApiKey', null);
    if (!apiKey) return null;
    const model = configService.get<string>('app.assistant.model', 'claude-opus-5-5');
    const effort = configService.get<string>('app.assistant.effort', 'medium');
    return new AnthropicAssistantProvider(apiKey, model, effort);
  }

  const apiKey = configService.get<string | null>('app.assistant.openaiApiKey', null);
  if (!apiKey) return null;
  const model = configService.get<string>('app.assistant.openaiModel', 'gpt-5.4-mini');
  return new OpenAiAssistantProvider(apiKey, model);
}

export const assistantLlmProviderFactory: Provider = {
  provide: ASSISTANT_LLM_PROVIDER,
  inject: [ConfigService],
  useFactory: createAssistantLlmProvider,
};
