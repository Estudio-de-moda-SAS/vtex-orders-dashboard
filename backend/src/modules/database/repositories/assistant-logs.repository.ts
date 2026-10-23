import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../pg-pool.provider';

export interface AssistantLogEntry {
  mode: string | null;
  questionText: string;
  toolCalls: unknown[];
  answerText: string | null;
  model: string;
  effort: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  errorMessage: string | null;
}

/** Auditoría de `/asistente` (migración 0022) — una fila por pregunta respondida, nunca se lee desde el dashboard, solo se escribe. */
@Injectable()
export class AssistantLogsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async insert(entry: AssistantLogEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO assistant_logs
         (mode, question_text, tool_calls, answer_text, model, effort, input_tokens, output_tokens, latency_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.mode,
        entry.questionText,
        JSON.stringify(entry.toolCalls),
        entry.answerText,
        entry.model,
        entry.effort,
        entry.inputTokens,
        entry.outputTokens,
        entry.latencyMs,
        entry.errorMessage,
      ],
    );
  }
}
