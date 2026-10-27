import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../../config/configuration';
import { PosSaleApiRow } from './pos-sales.interface';

/** Ver el mismo set en `credit-notes-client.service.ts` — misma API, mismo host. */
const UNREACHABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH']);
const TIMEOUT_ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNABORTED']);

export class PosSalesUnreachableError extends Error {
  constructor() {
    super('No se pudo conectar con el servidor de ventas POS — verifica que estés conectado a la VPN de la compañía.');
    this.name = 'PosSalesUnreachableError';
  }
}

export class PosSalesTimeoutError extends Error {
  constructor() {
    super('El servidor de ventas POS tardó demasiado en responder (puede pasar con rangos de fechas amplios) — intenta de nuevo, o con un rango más corto.');
    this.name = 'PosSalesTimeoutError';
  }
}

export class PosSalesCredentialsMissingError extends Error {
  constructor() {
    super('Faltan las credenciales de ventas POS — agrega CREDIT_NOTES_CONNI_KEY/CREDIT_NOTES_CONNI_TOKEN (o POS_SALES_CONNI_KEY/POS_SALES_CONNI_TOKEN) en .env.');
    this.name = 'PosSalesCredentialsMissingError';
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
 * Cliente de la API "Conní" del ERP (`ejecutarconsulta`) para ventas POS
 * del canal SmartSale — mismo host/credenciales que `CreditNotesClientService`
 * (ver `app.posSales` en `configuration.ts`), SOLO alcanzable desde la VPN
 * de la compañía. La usan `PosSalesSyncService`/`cli/pos-sales-sync.ts`,
 * pensados para correr manualmente (o programados) desde una máquina
 * conectada a la VPN.
 */
@Injectable()
export class PosSalesClientService {
  private readonly logger = new Logger(PosSalesClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /** `fromDay`/`toDay` en formato "YYYY-MM-DD" — se mandan tal cual en `@desde`/`@hasta`. */
  async fetchRange(fromDay: string, toDay: string): Promise<PosSaleApiRow[]> {
    const config = this.configService.get<AppConfig['posSales']>('app.posSales')!;
    if (!config.connectionKey || !config.connectionToken) {
      throw new PosSalesCredentialsMissingError();
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<PosSaleApiRow[]>(config.apiUrl, {
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
        throw new PosSalesUnreachableError();
      }
      if (isTimeoutError(error)) {
        throw new PosSalesTimeoutError();
      }
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`Falló la consulta de ventas POS (${fromDay} a ${toDay}): ${message}`);
      throw error;
    }
  }
}
