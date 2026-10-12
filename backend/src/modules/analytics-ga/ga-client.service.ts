import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaAnalyticsDataClient, protos } from '@google-analytics/data';

import { parseGaServiceAccountJson } from '../../common/utils/ga-credentials.util';

type RunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type RunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;
type CheckCompatibilityRequest = protos.google.analytics.data.v1beta.ICheckCompatibilityRequest;

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 2000;

/**
 * Envoltorio sobre `BetaAnalyticsDataClient` (Google Analytics Data API)
 * — única pieza del módulo GA4 que habla con Google. Reintenta con
 * backoff exponencial ante cuota agotada (`RESOURCE_EXHAUSTED`) o errores
 * transitorios (429/5xx), igual idea que `VtexOrdersService` con VTEX,
 * pero la Data API de GA4 reporta estos códigos como gRPC status, no HTTP.
 *
 * `undefined` si `GA_SERVICE_ACCOUNT_JSON` no está configurada — el resto
 * del módulo (`GaSyncService`) debe chequear `isConfigured()` antes de
 * usarlo y omitir la sincronización con un aviso, nunca lanzar un error
 * que tumbe el cron completo por falta de credenciales.
 */
@Injectable()
export class GaClientService {
  private readonly logger = new Logger(GaClientService.name);
  private readonly client: BetaAnalyticsDataClient | undefined;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string | null>('app.ga.serviceAccountJson', null);
    if (!raw) {
      this.logger.warn('GA_SERVICE_ACCOUNT_JSON no está configurada — el módulo de Google Analytics queda inactivo.');
      this.client = undefined;
      return;
    }
    try {
      const credentials = parseGaServiceAccountJson(raw);
      this.client = new BetaAnalyticsDataClient({ credentials });
    } catch (error) {
      // Nunca se loguea `raw` ni `error.message` si pudiera contener el valor crudo — solo un aviso genérico.
      this.logger.error('GA_SERVICE_ACCOUNT_JSON no se pudo interpretar como credencial de cuenta de servicio válida.');
      this.client = undefined;
    }
  }

  isConfigured(): boolean {
    return this.client !== undefined;
  }

  /**
   * Verifica, ANTES de construir un reporte real, que la combinación de
   * dimensiones/métricas pedida es compatible para esta propiedad (la
   * Data API rechaza algunas combinaciones según el tipo de propiedad o
   * el modo de medición configurado) — ver Parte 1 del encargo original.
   * Devuelve los nombres (`apiName`) que resultaron INCOMPATIBLES, vacío
   * si todo es válido.
   */
  async checkCompatibility(propertyId: string, dimensionNames: string[], metricNames: string[]): Promise<string[]> {
    if (!this.client) throw new Error('GaClientService no está configurado (falta GA_SERVICE_ACCOUNT_JSON).');

    const request: CheckCompatibilityRequest = {
      property: `properties/${propertyId}`,
      dimensions: dimensionNames.map((name) => ({ name })),
      metrics: metricNames.map((name) => ({ name })),
    };
    const [response] = await this.runWithRetry(() => this.client!.checkCompatibility(request));

    // La respuesta trae la compatibilidad de TODO el catálogo de dimensiones/métricas
    // de la propiedad respecto a este request (para descubrir qué MÁS se podría
    // agregar) — no solo de lo que se pidió. Hay que filtrar a solo los nombres
    // que SÍ pedimos; de lo contrario cualquier dimensión del catálogo que sea
    // incompatible entre sí (ej. dimensiones de publicidad vs. e-commerce) se
    // reporta como si fuera parte de nuestro propio reporte, aunque nunca se haya
    // pedido (confirmado en producción: una lista de 100+ nombres ajenos).
    const requestedDimensions = new Set(dimensionNames);
    const requestedMetrics = new Set(metricNames);

    const incompatible: string[] = [];
    for (const d of response.dimensionCompatibilities ?? []) {
      const apiName = d.dimensionMetadata?.apiName;
      if (apiName && requestedDimensions.has(apiName) && d.compatibility !== 'COMPATIBLE') incompatible.push(apiName);
    }
    for (const m of response.metricCompatibilities ?? []) {
      const apiName = m.metricMetadata?.apiName;
      if (apiName && requestedMetrics.has(apiName) && m.compatibility !== 'COMPATIBLE') incompatible.push(apiName);
    }
    return incompatible;
  }

  /** Pagina automáticamente con `limit`/`offset` hasta cubrir `rowCount` — ver `GaSyncService`, que llama esto una vez por reporte. */
  async runReportAllRows(request: RunReportRequest, pageSize = 10000): Promise<RunReportResponse['rows']> {
    if (!this.client) throw new Error('GaClientService no está configurado (falta GA_SERVICE_ACCOUNT_JSON).');

    const allRows: NonNullable<RunReportResponse['rows']> = [];
    let offset = 0;
    // `rowCount` solo viene en la primera respuesta, pero se repite en cada una — se usa el de la última respuesta recibida.
    let rowCount = Infinity;

    while (offset < rowCount) {
      const [response] = await this.runWithRetry(() =>
        this.client!.runReport({ ...request, limit: String(pageSize), offset: String(offset) }),
      );
      rowCount = response.rowCount ?? 0;
      allRows.push(...(response.rows ?? []));
      offset += pageSize;
      if ((response.rows?.length ?? 0) === 0) break; // salvaguarda: evita loop infinito si `rowCount` viniera mal.
    }

    return allRows;
  }

  /** Backoff exponencial ante cuota (`RESOURCE_EXHAUSTED`, código gRPC 8) o errores transitorios (`UNAVAILABLE`=14, 429/5xx envueltos). */
  private async runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (error) {
        const code = (error as { code?: number })?.code;
        const isRetryable = code === 8 || code === 14 || code === 4; // RESOURCE_EXHAUSTED, UNAVAILABLE, DEADLINE_EXCEEDED
        if (!isRetryable || attempt >= MAX_RETRIES) throw error;
        const backoffMs = BASE_BACKOFF_MS * 2 ** attempt;
        this.logger.warn(`Reintentando llamada a GA4 Data API (intento ${attempt + 1}/${MAX_RETRIES}) tras ${backoffMs}ms — código ${code}.`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        attempt += 1;
      }
    }
  }
}
