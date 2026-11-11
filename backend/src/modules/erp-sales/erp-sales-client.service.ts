import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../../config/configuration';
import { ErpSaleApiRow } from './erp-sales.interface';

/** Ver el mismo set en `credit-notes-client.service.ts` — misma API, mismo host. */
const UNREACHABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH']);
const TIMEOUT_ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNABORTED']);

export class ErpSalesUnreachableError extends Error {
  constructor() {
    super('No se pudo conectar con el servidor de facturas ERP — verifica que estés conectado a la VPN de la compañía.');
    this.name = 'ErpSalesUnreachableError';
  }
}

export class ErpSalesTimeoutError extends Error {
  constructor(fromDay: string, toDay: string) {
    super(`El servidor de facturas ERP tardó demasiado en responder (${fromDay} a ${toDay}) — intenta de nuevo, o baja ERP_SALES_CHUNK_DAYS.`);
    this.name = 'ErpSalesTimeoutError';
  }
}

export class ErpSalesCredentialsMissingError extends Error {
  constructor() {
    super('Faltan las credenciales de facturas ERP — agrega CREDIT_NOTES_CONNI_KEY/CREDIT_NOTES_CONNI_TOKEN (o ERP_SALES_CONNI_KEY/ERP_SALES_CONNI_TOKEN) en .env.');
    this.name = 'ErpSalesCredentialsMissingError';
  }
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Cliente de la API "Conní" del ERP para las facturas e-commerce — mismo
 * host/credenciales que notas crédito, SOLO alcanzable desde la VPN. Una
 * llamada = un rango; el troceo en tramos de 3 días lo hace
 * `ErpSalesSyncService`.
 */
@Injectable()
export class ErpSalesClientService {
  private readonly logger = new Logger(ErpSalesClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /** `fromDay`/`toDay` en "YYYY-MM-DD" — se mandan tal cual en `@desde`/`@hasta`. */
  async fetchRange(fromDay: string, toDay: string): Promise<ErpSaleApiRow[]> {
    const config = this.configService.get<AppConfig['erpSales']>('app.erpSales')!;
    if (!config.connectionKey || !config.connectionToken) {
      throw new ErpSalesCredentialsMissingError();
    }

    const startedAt = Date.now();
    try {
      const response = await firstValueFrom(
        this.httpService.get<ErpSaleApiRow[]>(config.apiUrl, {
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
      const code = errorCode(error);
      if (code && UNREACHABLE_ERROR_CODES.has(code)) throw new ErpSalesUnreachableError();
      // Windows corta un intento de CONEXIÓN fallido con ETIMEDOUT a los ~21s
      // (confirmado sin VPN). Si eso pasa mucho antes de nuestro timeout de
      // respuesta, el host nunca respondió: es falta de VPN, no un reporte lento.
      if (code === 'ETIMEDOUT' && Date.now() - startedAt < config.requestTimeoutMs * 0.8) throw new ErpSalesUnreachableError();
      if (code && TIMEOUT_ERROR_CODES.has(code)) throw new ErpSalesTimeoutError(fromDay, toDay);
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`Falló la consulta de facturas ERP (${fromDay} a ${toDay}): ${message}`);
      throw error;
    }
  }
}
