import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../../config/configuration';
import { CreditNoteApiRow } from './credit-notes.interface';

/**
 * Códigos de error de Node cuando NUNCA se logró establecer la conexión —
 * exactamente lo que pasa al llamar esta API SIN estar conectado a la VPN
 * de la compañía (el host `10.10.21.7` no es público): el sistema
 * operativo rechaza o no encuentra ruta al host, de inmediato.
 * DELIBERADAMENTE no incluye `ETIMEDOUT`/`ECONNABORTED` — ver
 * `TIMEOUT_ERROR_CODES` — confirmado en producción: la conexión SÍ se
 * establece bien con VPN, pero esta API (un reporte del ERP) puede tardar
 * bastante más que una API normal en responder, y confundir ambos casos
 * le decía al usuario "conéctate a la VPN" cuando el problema real era un
 * timeout demasiado corto.
 */
const UNREACHABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH']);
/** La conexión SÍ se estableció pero la respuesta no llegó a tiempo — típico de un reporte pesado (rango de fechas amplio), no de falta de VPN. */
const TIMEOUT_ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNABORTED']);

export class CreditNotesUnreachableError extends Error {
  constructor() {
    super('No se pudo conectar con el servidor de notas crédito — verifica que estés conectado a la VPN de la compañía.');
    this.name = 'CreditNotesUnreachableError';
  }
}

export class CreditNotesTimeoutError extends Error {
  constructor() {
    super('El servidor de notas crédito tardó demasiado en responder (puede pasar con rangos de fechas amplios) — intenta de nuevo, o con un rango más corto.');
    this.name = 'CreditNotesTimeoutError';
  }
}

export class CreditNotesCredentialsMissingError extends Error {
  constructor() {
    super('Faltan las credenciales de notas crédito — agrega CREDIT_NOTES_CONNI_KEY y CREDIT_NOTES_CONNI_TOKEN en .env.');
    this.name = 'CreditNotesCredentialsMissingError';
  }
}

function isUnreachableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === 'string' && UNREACHABLE_ERROR_CODES.has(code);
}

function isTimeoutError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === 'string' && TIMEOUT_ERROR_CODES.has(code);
}

/**
 * Cliente de la API "Conní" del ERP (`ejecutarconsulta`) — SOLO alcanzable
 * desde la VPN de la compañía (`10.10.21.7` es una IP interna). Nunca se
 * llama desde el ciclo normal del backend desplegado; la usan
 * `CreditNotesSyncService`/`cli/credit-notes-sync.ts`, pensados para
 * correr manualmente (o programados) desde una máquina conectada a la VPN.
 */
@Injectable()
export class CreditNotesClientService {
  private readonly logger = new Logger(CreditNotesClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /** `fromDay`/`toDay` en formato "YYYY-MM-DD" — se mandan tal cual en `@desde`/`@hasta`. */
  async fetchRange(fromDay: string, toDay: string): Promise<CreditNoteApiRow[]> {
    const config = this.configService.get<AppConfig['creditNotes']>('app.creditNotes')!;
    if (!config.connectionKey || !config.connectionToken) {
      throw new CreditNotesCredentialsMissingError();
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<CreditNoteApiRow[]>(config.apiUrl, {
          params: {
            idCompania: config.companyId,
            descripcion: config.queryName,
            parametros: `@desde=${fromDay}|@hasta=${toDay}`,
          },
          headers: {
            ConniKey: config.connectionKey,
            ConniToken: config.connectionToken,
            Accept: 'application/json',
          },
          timeout: config.requestTimeoutMs,
        }),
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      if (isUnreachableError(error)) {
        throw new CreditNotesUnreachableError();
      }
      if (isTimeoutError(error)) {
        throw new CreditNotesTimeoutError();
      }
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`Falló la consulta de notas crédito (${fromDay} a ${toDay}): ${message}`);
      throw error;
    }
  }
}
