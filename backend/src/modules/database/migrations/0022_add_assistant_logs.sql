-- Auditoría del asistente conversacional (`/asistente`) — una fila por
-- pregunta respondida, para poder revisar qué se preguntó, qué
-- herramientas se usaron y qué costó. Sin `user_id`: esta app no tiene
-- autenticación por usuario (igual que `/presupuesto`, solo protegido por
-- un código compartido). Limpieza de registros viejos (>90 días): pendiente,
-- fuera de esta fase — ver plan.
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS assistant_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode TEXT,
  question_text TEXT NOT NULL,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer_text TEXT,
  model TEXT NOT NULL,
  effort TEXT,
  input_tokens INT,
  output_tokens INT,
  latency_ms INT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_assistant_logs_created_at ON assistant_logs (created_at);

COMMIT;
