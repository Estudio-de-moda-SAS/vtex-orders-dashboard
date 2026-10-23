/**
 * Error "seguro de mostrar" al modelo — su `message` se devuelve tal cual
 * dentro del `tool_result` (`is_error: true`) para que el modelo pueda
 * explicárselo al usuario o repreguntar, en vez de recibir un stack trace
 * interno. Cualquier otro error (bug real, falla de conexión a la base)
 * se captura aparte y se convierte en un mensaje genérico — ver
 * `assistant-tools.registry.ts`.
 */
export class AssistantToolError extends Error {}
