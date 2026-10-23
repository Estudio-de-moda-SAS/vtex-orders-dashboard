/**
 * Espejo de los eventos SSE que envía `backend/src/modules/assistant/assistant.controller.ts`.
 */

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantStreamEvent {
  text?: string;
  error?: string;
}
