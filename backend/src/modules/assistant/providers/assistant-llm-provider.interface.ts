/** Un turno previo de la conversación — mismo shape que usa el frontend (ver `dto/assistant-chat.dto.ts`). */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Forma NEUTRAL de una herramienta — ni el formato de Anthropic
 * (`input_schema`) ni el de OpenAI (`tools: [{type:'function', function:{parameters}}]`).
 * Cada proveedor traduce esto a su propio formato de cable — las 6
 * herramientas y sus JSON Schema se definen UNA sola vez en
 * `assistant-tools.registry.ts`, nunca duplicadas por proveedor.
 */
export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface ToolCallLogEntry {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

export interface AssistantLlmRunResult {
  toolCalls: ToolCallLogEntry[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Un proveedor de LLM para el asistente — corre la conversación COMPLETA
 * (incluyendo su propio loop interno de tool use, que tiene una forma
 * distinta en cada API) y transmite el texto de la respuesta a medida que
 * llega. `executeTool` es siempre el mismo (`AssistantToolsRegistry.execute`)
 * sin importar el proveedor — las herramientas son 100% independientes del
 * modelo que las invoca.
 */
export interface AssistantLlmProvider {
  streamConversation(params: {
    systemPrompt: string;
    tools: AssistantToolDefinition[];
    history: ChatMessage[];
    question: string;
    executeTool: (name: string, input: unknown) => Promise<unknown>;
  }): AsyncGenerator<string, AssistantLlmRunResult, void>;
}
