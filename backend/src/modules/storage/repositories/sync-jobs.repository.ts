import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

import { DatabaseService } from '../database.service';

export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SyncJob {
  id: string;
  label: string;
  status: SyncJobStatus;
  totalDays: number;
  completedDays: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface SyncJobRow {
  id: string;
  label: string;
  status: string;
  total_days: number;
  completed_days: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: SyncJobRow): SyncJob {
  return {
    id: row.id,
    label: row.label,
    status: row.status as SyncJobStatus,
    totalDays: row.total_days,
    completedDays: row.completed_days,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Repositorio de la tabla `sync_jobs`: trabajos de sincronización en
 * segundo plano (backfills grandes que no deben bloquear la petición
 * HTTP del dashboard). Persistido en SQLite para que el estado sobreviva
 * un reinicio del backend, no solo en memoria.
 */
@Injectable()
export class SyncJobsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  create(label: string, totalDays: number): SyncJob {
    const db = this.databaseService.getConnection();
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO sync_jobs (id, label, status, total_days, completed_days, error, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, 0, NULL, ?, ?)`,
    ).run(id, label, totalDays, now, now);
    return { id, label, status: 'pending', totalDays, completedDays: 0, createdAt: now, updatedAt: now };
  }

  update(id: string, patch: Partial<Pick<SyncJob, 'status' | 'completedDays' | 'error'>>): void {
    const db = this.databaseService.getConnection();
    const current = this.findById(id);
    if (!current) return;

    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    db.prepare(
      `UPDATE sync_jobs SET status = ?, completed_days = ?, error = ?, updated_at = ? WHERE id = ?`,
    ).run(next.status, next.completedDays, next.error ?? null, next.updatedAt, id);
  }

  findById(id: string): SyncJob | undefined {
    const db = this.databaseService.getConnection();
    const row = db.prepare(`SELECT * FROM sync_jobs WHERE id = ?`).get(id) as unknown as SyncJobRow | undefined;
    return row ? rowToJob(row) : undefined;
  }

  /** Jobs actualmente en curso (para no lanzar dos backfills duplicados del mismo rango). */
  findRunningByLabel(label: string): SyncJob | undefined {
    const db = this.databaseService.getConnection();
    const row = db
      .prepare(`SELECT * FROM sync_jobs WHERE label = ? AND status IN ('pending','running') ORDER BY created_at DESC LIMIT 1`)
      .get(label) as unknown as SyncJobRow | undefined;
    return row ? rowToJob(row) : undefined;
  }

  /**
   * Marca como `failed` cualquier job con esta etiqueta que haya quedado en
   * `pending`/`running` de un proceso anterior (ej. el backend se reinició
   * a medio camino y ese job nunca pudo terminar de actualizarse). Pensado
   * para llamarse una sola vez al arrancar, antes de decidir si hace falta
   * lanzar un job nuevo — evita que `findRunningByLabel` bloquee para
   * siempre un reintento por culpa de un registro huérfano.
   */
  failStaleRunningJobs(label: string, errorMessage: string): void {
    const db = this.databaseService.getConnection();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE sync_jobs SET status = 'failed', error = ?, updated_at = ? WHERE label = ? AND status IN ('pending','running')`,
    ).run(errorMessage, now, label);
  }
}
