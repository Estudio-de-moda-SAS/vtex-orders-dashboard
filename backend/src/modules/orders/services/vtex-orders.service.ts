import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import pLimit from 'p-limit';

import { StoreConfig } from '../../../config/stores.config';
import { diffMs, midpointIso, toVtexDateFilterFormat } from '../../../common/utils/date-range.util';
import { normalizeVtexMoneyValue } from '../../../common/utils/money-normalizer.util';
import { VtexOrder, VtexOrderDetailResponse, VtexOrdersResponse } from '../interfaces/vtex-order.interface';

export interface FetchStoreOrdersResult {
  orders: VtexOrder[];
  /** Total de páginas efectivamente solicitadas a VTEX (sumando todas las sub-ventanas de fecha, si hubo partición). */
  pagesProcessed: number;
  /**
   * Páginas que NUNCA se pudieron obtener, ni siquiera después de los
   * reintentos internos por página ni de las rondas adicionales de
   * reintento ("sweeps"). Si es mayor a 0, `orders` está incompleto.
   */
  pagesFailed: number;
  /** Suma de `paging.total` que reportó VTEX en la página 1 de cada sub-ventana consultada. */
  totalReportedByVtex: number;
  /**
   * `true` si no hubo páginas fallidas Y la cantidad de órdenes obtenidas
   * coincide con `totalReportedByVtex`. `false` indica que los totales de
   * esta consulta son un piso, no el valor real (probablemente hay más
   * órdenes de las que se lograron traer).
   */
  isComplete: boolean;
  /** Estimado de cuántas órdenes podrían estar faltando (`totalReportedByVtex - orders.length`, nunca negativo). */
  missingOrders: number;
  /**
   * `true` si alguna página falló con un error PERMANENTE (ej. HTTP 400).
   * Uso interno: le indica a `fetchDateRangeChunk` que debe partir el
   * rango de fechas de forma reactiva, aunque el offset calculado no
   * superara `maxSafeOffset` — la evidencia real (un 400) es más
   * confiable que el umbral configurado, que puede estar mal calibrado
   * para esta cuenta VTEX específica.
   */
  hadPermanentFailure: boolean;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RATE_LIMIT_STATUS = 429;
/**
 * Códigos HTTP que indican un rechazo PERMANENTE de VTEX — la petición en
 * sí está mal formada o prohibida, no es un problema temporal de red o de
 * capacidad. Reintentar esto (incluso con más tiempo de espera) nunca va
 * a funcionar. El caso real que motivó esto: un HTTP 400 consistente a
 * partir de cierta página (paginación demasiado profunda para esa
 * cuenta VTEX específica) — ver `maxSafeOffset`.
 */
const PERMANENT_CLIENT_ERROR_CODES = new Set([400, 401, 403, 404, 422]);

/** Error con el código HTTP original preservado, para que quien lo reciba (ej. las rondas de reintento) pueda decidir si vale la pena reintentar. */
class VtexRequestError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'VtexRequestError';
  }

  /** `true` si este error es un rechazo permanente (ej. 400): reintentarlo no tiene sentido, sin importar cuánto se espere. */
  get isPermanent(): boolean {
    return this.httpStatus !== undefined && PERMANENT_CLIENT_ERROR_CODES.has(this.httpStatus);
  }
}

/**
 * Responsable exclusivo de la comunicación HTTP con la API de VTEX.
 * No conoce nada sobre analítica ni sobre el frontend: solo sabe cómo
 * pedir órdenes de una tienda para un rango de fechas, paginando y
 * reintentando de forma controlada.
 *
 * TRES problemas distintos pueden hacer que falten órdenes, y este
 * servicio los ataca por separado:
 *
 * 1. Fallas TRANSITORIAS genéricas (timeouts, 5xx puntuales): reintentos
 *    cortos por página (`maxRetries`) y, si no alcanza, rondas adicionales
 *    sobre las páginas pendientes (`pageRetrySweeps`).
 *
 * 2. RATE LIMIT (HTTP 429): se trata distinto a una falla genérica. Un
 *    429 significa "estás pidiendo más rápido de lo permitido", así que
 *    reintentar rápido (300-600ms) casi siempre vuelve a fallar — hay que
 *    esperar mucho más (backoff exponencial, `rateLimitBackoffBaseMs`) y
 *    se le da un presupuesto de reintentos más generoso
 *    (`rateLimitMaxRetries`) que a una falla genérica, porque esperar más
 *    tiempo no cuesta corrección, solo velocidad. Además, TODAS las
 *    peticiones a VTEX (sin importar de qué tienda o segmento vengan)
 *    pasan por un límite de concurrencia GLOBAL (`globalConcurrency`) —
 *    un límite que se resetea "por tienda" no sirve si VTEX en realidad
 *    limita a nivel de cuenta u organización.
 *
 * 3. PAGINACIÓN PROFUNDA: VTEX (como muchos backends construidos sobre
 *    Elasticsearch) tiende a volverse inestable o a fallar de forma
 *    consistente cuando el offset (`(page-1)*per_page`) es muy grande —
 *    esto NO es transitorio, reintentar la misma página profunda vuelve a
 *    fallar igual. La solución es evitar llegar a ese offset: si una
 *    consulta necesitaría más páginas de las que el offset máximo seguro
 *    permite (`maxSafeOffset`), el rango de fechas se PARTE en dos mitades
 *    automáticamente (ver `fetchDateRangeChunk`).
 */
@Injectable()
export class VtexOrdersService {
  private readonly logger = new Logger(VtexOrdersService.name);

  private readonly pageConcurrency: number;
  private readonly perPage: number;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly moneyDivisor: number;
  private readonly pageRetrySweeps: number;
  private readonly maxSafeOffset: number;
  private readonly minChunkMs: number;
  private readonly maxSplitDepth: number;
  private readonly rateLimitBackoffBaseMs: number;
  private readonly rateLimitMaxRetries: number;

  /**
   * Límite de concurrencia GLOBAL: como esta clase es un singleton (una
   * sola instancia para toda la aplicación), este `pLimit` se comparte
   * entre TODAS las tiendas y TODOS los segmentos. Es la única forma de
   * garantizar que, sin importar cuántas tiendas se consulten en
   * paralelo, nunca haya más de `globalConcurrency` peticiones a VTEX en
   * vuelo al mismo tiempo en toda la aplicación.
   */
  private readonly globalLimit: ReturnType<typeof pLimit>;

  /**
   * Cuántas llamadas a `fetchAllOrders` (listado paginado — dashboard on
   * demand, backfill histórico o sync nocturna) están en curso en este
   * momento. Se usa exclusivamente para que
   * `OrderCityEnrichmentService` sepa cuándo debe pausar y ceder el
   * paso: aunque ambos comparten el mismo `globalLimit`, esa cola es
   * estrictamente FIFO (sin prioridad), así que un lote de detalle
   * encolado justo antes de una consulta real puede demorarla lo
   * suficiente como para que la ventana "en vivo" (que sigue mutando en
   * tiempo real) se corra entre página y página — ver
   * `isListingBusy()`.
   */
  private activeListingRequests = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.pageConcurrency = this.configService.get<number>('app.vtex.pageConcurrency', 3);
    this.perPage = this.configService.get<number>('app.vtex.perPage', 50);
    this.requestTimeoutMs = this.configService.get<number>('app.vtex.requestTimeoutMs', 15000);
    this.maxRetries = this.configService.get<number>('app.vtex.maxRetries', 2);
    this.moneyDivisor = this.configService.get<number>('app.vtex.moneyDivisor', 1000);
    this.pageRetrySweeps = this.configService.get<number>('app.vtex.pageRetrySweeps', 3);
    this.maxSafeOffset = this.configService.get<number>('app.vtex.maxSafeOffset', 3000);
    this.maxSplitDepth = this.configService.get<number>('app.vtex.maxSplitDepth', 12);
    const minChunkMinutes = this.configService.get<number>('app.vtex.minChunkMinutes', 5);
    this.minChunkMs = minChunkMinutes * 60 * 1000;
    this.rateLimitBackoffBaseMs = this.configService.get<number>('app.vtex.rateLimitBackoffBaseMs', 2000);
    this.rateLimitMaxRetries = this.configService.get<number>('app.vtex.rateLimitMaxRetries', 5);

    const globalConcurrency = this.configService.get<number>('app.vtex.globalConcurrency', 4);
    this.globalLimit = pLimit(globalConcurrency);
  }

  /**
   * Obtiene todas las órdenes de una tienda dentro del rango de fechas dado.
   * Si el volumen de órdenes implicaría paginar más profundo de lo seguro,
   * el rango se parte automáticamente en sub-ventanas más pequeñas (ver
   * comentario de la clase). Elimina duplicados por `orderId` al final.
   *
   * @param extraParams Parámetros adicionales de VTEX a incluir en cada
   *   request (ej. `{ f_sellerNames: 'ARMO STUDIO' }` o
   *   `{ salesChannelId: '25' }`), usados para segmentar por vendedor o
   *   por canal de marketplace.
   */
  async fetchAllOrders(
    store: StoreConfig,
    startDateIso: string,
    endDateIso: string,
    extraParams?: Record<string, string>,
  ): Promise<FetchStoreOrdersResult> {
    this.assertCredentials(store);
    this.activeListingRequests += 1;
    try {
      return await this.fetchDateRangeChunk(store, startDateIso, endDateIso, extraParams, 0);
    } finally {
      this.activeListingRequests -= 1;
    }
  }

  /** `true` si hay al menos una consulta de listado en curso — ver `OrderCityEnrichmentService`. */
  isListingBusy(): boolean {
    return this.activeListingRequests > 0;
  }

  /**
   * Consulta un rango de fechas (posiblemente una sub-ventana de un rango
   * mayor), partiéndolo recursivamente en dos mitades si sería necesario
   * paginar más profundo de lo seguro.
   */
  private async fetchDateRangeChunk(
    store: StoreConfig,
    startDateIso: string,
    endDateIso: string,
    extraParams: Record<string, string> | undefined,
    depth: number,
  ): Promise<FetchStoreOrdersResult> {
    const firstPage = await this.fetchPage(store, startDateIso, endDateIso, 1, extraParams);
    const totalPages = Math.max(firstPage.paging.pages, 1);
    const totalReportedByVtex = firstPage.paging.total;
    const deepestOffset = (totalPages - 1) * this.perPage;

    const canSplit =
      depth < this.maxSplitDepth && diffMs(startDateIso, endDateIso) > this.minChunkMs * 2;

    if (deepestOffset > this.maxSafeOffset && canSplit) {
      const midIso = midpointIso(startDateIso, endDateIso);
      this.logger.warn(
        `[${store.id}] La ventana ${startDateIso} → ${endDateIso} necesitaría ${totalPages} páginas (offset máx. ${deepestOffset} > ${this.maxSafeOffset}). Partiendo en dos mitades por ${midIso}.`,
      );

      const [left, right] = await Promise.all([
        this.fetchDateRangeChunk(store, startDateIso, midIso, extraParams, depth + 1),
        this.fetchDateRangeChunk(store, midIso, endDateIso, extraParams, depth + 1),
      ]);
      return this.mergeFetchResults(left, right);
    }

    // La ventana ya es lo bastante chica según nuestro umbral configurado
    // (o no se puede partir más): paginar normalmente, con reintentos por
    // página y rondas adicionales para fallas transitorias.
    const result = await this.fetchSingleWindow(
      store,
      startDateIso,
      endDateIso,
      extraParams,
      firstPage,
      totalPages,
      totalReportedByVtex,
    );

    // Salvaguarda reactiva: si a pesar de que el offset parecía seguro
    // según `maxSafeOffset`, VTEX igual rechazó alguna página con un error
    // PERMANENTE (ej. HTTP 400), es una señal más confiable que nuestro
    // umbral configurado de que esta cuenta VTEX tiene un límite de
    // paginación más bajo del que asumimos. En ese caso, se parte el
    // rango de todas formas (aunque el offset no lo ameritara "en teoría")
    // y se reintenta con ventanas más chicas, en vez de simplemente
    // resignarse a perder esas órdenes.
    if (result.hadPermanentFailure && canSplit) {
      const midIso = midpointIso(startDateIso, endDateIso);
      this.logger.warn(
        `[${store.id}] La ventana ${startDateIso} → ${endDateIso} tuvo página(s) rechazadas de forma permanente por VTEX (probable límite real de paginación menor a maxSafeOffset=${this.maxSafeOffset}). Partiendo en dos mitades por ${midIso} y reintentando.`,
      );
      const [left, right] = await Promise.all([
        this.fetchDateRangeChunk(store, startDateIso, midIso, extraParams, depth + 1),
        this.fetchDateRangeChunk(store, midIso, endDateIso, extraParams, depth + 1),
      ]);
      return this.mergeFetchResults(left, right);
    }

    return result;
  }

  private async fetchSingleWindow(
    store: StoreConfig,
    startDateIso: string,
    endDateIso: string,
    extraParams: Record<string, string> | undefined,
    firstPage: VtexOrdersResponse,
    totalPages: number,
    totalReportedByVtex: number,
  ): Promise<FetchStoreOrdersResult> {
    const ordersById = new Map<string, VtexOrder>();
    this.mergeOrders(ordersById, firstPage.list);

    let pendingPages = Array.from({ length: totalPages - 1 }, (_, idx) => idx + 2);
    /**
     * Páginas que fallaron con un error PERMANENTE (ej. HTTP 400): se
     * dejan de reintentar de inmediato, sin gastar las rondas de sweep en
     * algo que nunca va a funcionar. Cuentan igual como "página fallida"
     * para `pagesFailed`/`isComplete`, pero no consumen tiempo extra.
     */
    const permanentlyFailedPages = new Set<number>();

    for (let sweep = 0; sweep <= this.pageRetrySweeps && pendingPages.length > 0; sweep++) {
      if (sweep > 0) {
        const backoffMs = 1000 * sweep;
        this.logger.warn(
          `[${store.id}] Reintentando ${pendingPages.length} página(s) que fallaron (ronda ${sweep}/${this.pageRetrySweeps}, esperando ${backoffMs}ms)`,
        );
        await this.sleep(backoffMs);
      }

      // NOTA: `pageConcurrency` limita cuántas páginas de ESTA ventana se
      // piden en paralelo, pero la concurrencia real hacia VTEX también
      // está acotada por `globalLimit` (ver `fetchPage`), que aplica sin
      // importar qué tienda o segmento esté pidiendo.
      const limit = pLimit(this.pageConcurrency);
      const results = await Promise.allSettled(
        pendingPages.map((page) =>
          limit(() => this.fetchPage(store, startDateIso, endDateIso, page, extraParams)),
        ),
      );

      const stillPending: number[] = [];
      results.forEach((result, index) => {
        const page = pendingPages[index];
        if (result.status === 'fulfilled') {
          this.mergeOrders(ordersById, result.value.list);
          return;
        }

        const reason = result.reason;
        const isPermanent = reason instanceof VtexRequestError && reason.isPermanent;

        if (isPermanent) {
          // No tiene caso seguir intentando: VTEX está rechazando esta
          // página de forma estructural (ej. paginación demasiado
          // profunda para esta cuenta — ver `maxSafeOffset`), no por un
          // problema temporal. Reintentar no cambiaría el resultado.
          permanentlyFailedPages.add(page);
          this.logger.error(
            `[${store.id}] Página ${page} rechazada de forma permanente por VTEX (no se reintentará): ${this.describeError(reason)}`,
          );
        } else {
          stillPending.push(page);
          this.logger.warn(
            `[${store.id}] Falló la página ${page} (ronda ${sweep}): ${this.describeError(reason)}`,
          );
        }
      });
      pendingPages = stillPending;
    }

    const totalFailedPages = pendingPages.length + permanentlyFailedPages.size;

    if (pendingPages.length > 0) {
      this.logger.error(
        `[${store.id}] No fue posible obtener ${pendingPages.length} página(s) tras ${this.pageRetrySweeps} ronda(s) de reintento adicionales: páginas [${pendingPages.join(
          ', ',
        )}]. El total de esta ventana está incompleto.`,
      );
    }
    if (permanentlyFailedPages.size > 0) {
      this.logger.error(
        `[${store.id}] ${permanentlyFailedPages.size} página(s) rechazada(s) de forma permanente por VTEX: [${Array.from(
          permanentlyFailedPages,
        ).join(', ')}]. Si esto ocurre en offsets altos de forma consistente, considera bajar VTEX_MAX_SAFE_OFFSET.`,
      );
    }

    const orders = Array.from(ordersById.values());
    const missingOrders = Math.max(0, totalReportedByVtex - orders.length);
    const isComplete = totalFailedPages === 0 && missingOrders === 0;

    if (totalFailedPages > 0) {
      // Falla real: hubo páginas que nunca se pudieron descargar.
      this.logger.warn(
        `[${store.id}] Ventana incompleta: se obtuvieron ${orders.length} órdenes de ${totalReportedByVtex} reportadas por VTEX (${totalFailedPages} página(s) sin poder descargar).`,
      );
    } else if (missingOrders > 0) {
      // No es una falla: todas las páginas se descargaron bien. La
      // diferencia es "drift" esperado en una ventana con datos en vivo
      // (VTEX reportó el total al iniciar, y el dato real puede haber
      // cambiado — ej. una orden nueva — mientras terminábamos de paginar).
      // Se registra como información, no como advertencia.
      this.logger.log(
        `[${store.id}] Diferencia esperada por datos en vivo: se obtuvieron ${orders.length} órdenes de ${totalReportedByVtex} reportadas al iniciar la consulta (ninguna página falló; es una foto de un momento específico, no un error).`,
      );
    }

    return {
      orders,
      pagesProcessed: totalPages,
      pagesFailed: totalFailedPages,
      totalReportedByVtex,
      isComplete,
      missingOrders,
      hadPermanentFailure: permanentlyFailedPages.size > 0,
    };
  }

  /** Combina los resultados de dos sub-ventanas de fecha (no solapadas), deduplicando por `orderId`. */
  private mergeFetchResults(a: FetchStoreOrdersResult, b: FetchStoreOrdersResult): FetchStoreOrdersResult {
    const ordersById = new Map<string, VtexOrder>();
    for (const order of a.orders) ordersById.set(order.orderId, order);
    for (const order of b.orders) ordersById.set(order.orderId, order);

    return {
      orders: Array.from(ordersById.values()),
      pagesProcessed: a.pagesProcessed + b.pagesProcessed,
      pagesFailed: a.pagesFailed + b.pagesFailed,
      totalReportedByVtex: a.totalReportedByVtex + b.totalReportedByVtex,
      isComplete: a.isComplete && b.isComplete,
      missingOrders: a.missingOrders + b.missingOrders,
      hadPermanentFailure: a.hadPermanentFailure || b.hadPermanentFailure,
    };
  }

  private mergeOrders(target: Map<string, VtexOrder>, incoming: VtexOrder[] | null | undefined) {
    for (const order of incoming ?? []) {
      if (order?.orderId) {
        // Se normaliza `totalValue` aquí, en el único punto de entrada de las
        // órdenes al sistema. Todo lo que consuma estas órdenes después
        // (analítica, KPIs, tarjetas, tabla y gráficos) ya recibe el valor
        // corregido, sin necesidad de repetir la conversión en ningún otro
        // archivo. Ver common/utils/money-normalizer.util.ts.
        target.set(order.orderId, {
          ...order,
          totalValue: normalizeVtexMoneyValue(order.totalValue, this.moneyDivisor),
        });
      }
    }
  }

  private assertCredentials(store: StoreConfig): void {
    if (!store.appKey || !store.appToken) {
      throw new Error(
        `Credenciales no configuradas para la tienda "${store.id}". Verifique las variables de entorno.`,
      );
    }
  }

  private buildUrl(store: StoreConfig): string {
    return `https://${store.accountName}.${store.environment}.com.br/api/oms/pvt/orders`;
  }

  private buildOrderDetailUrl(store: StoreConfig, orderId: string): string {
    return `https://${store.accountName}.${store.environment}.com.br/api/oms/pvt/orders/${encodeURIComponent(orderId)}`;
  }

  private async fetchPage(
    store: StoreConfig,
    startDateIso: string,
    endDateIso: string,
    page: number,
    extraParams?: Record<string, string>,
  ): Promise<VtexOrdersResponse> {
    const url = this.buildUrl(store);
    const creationDateFilter = `creationDate:[${toVtexDateFilterFormat(
      startDateIso,
    )} TO ${toVtexDateFilterFormat(endDateIso)}]`;

    const data = await this.requestWithRetry<VtexOrdersResponse>(
      store,
      url,
      {
        orderBy: 'creationDate,asc',
        page,
        per_page: this.perPage,
        f_creationDate: creationDateFilter,
        ...extraParams,
      },
      `la página ${page}`,
    );

    this.validateResponseShape(data, store.id, page);
    return data;
  }

  /**
   * Obtiene el detalle completo de UNA orden puntual. A diferencia del
   * listado paginado (`fetchAllOrders`), este método existe solo para el
   * enriquecimiento de ciudad en segundo plano (ver
   * `OrderCityEnrichmentService`): VTEX no expone `shippingData` en el
   * listado, solo en el detalle de cada orden individual. Pasa por el
   * MISMO `globalLimit` y la misma lógica de reintentos/backoff que el
   * resto de las peticiones a VTEX.
   */
  async fetchOrderDetail(store: StoreConfig, orderId: string): Promise<VtexOrderDetailResponse> {
    this.assertCredentials(store);
    const url = this.buildOrderDetailUrl(store, orderId);
    return this.requestWithRetry<VtexOrderDetailResponse>(
      store,
      url,
      undefined,
      `el detalle de la orden ${orderId}`,
      // Se re-chequea `isListingBusy()` justo antes de CADA intento (no
      // solo una vez por lote en `OrderCityEnrichmentService`): eso deja
      // una ventana mínima entre "decidir que se puede pedir" y "la
      // petición realmente se encola en `globalLimit`", en vez de dejar
      // que un lote entero ya en curso siga ocupando slots globales
      // mientras una consulta de listado real está esperando.
      () => this.waitWhileListingBusy(),
    );
  }

  private async waitWhileListingBusy(): Promise<void> {
    while (this.activeListingRequests > 0) {
      await this.sleep(150);
    }
  }

  /**
   * Primitivo genérico de request a VTEX: pasa SIEMPRE por `globalLimit` y
   * aplica la misma política de reintentos que `fetchPage` originalmente
   * tenía embebida (429 con backoff exponencial/`Retry-After`, fallas
   * transitorias con backoff lineal corto, fallas permanentes sin
   * reintento). `context` es solo para logs/mensajes de error (ej.
   * "la página 3" o "el detalle de la orden 123-01").
   */
  private async requestWithRetry<T>(
    store: StoreConfig,
    url: string,
    params: Record<string, unknown> | undefined,
    context: string,
    beforeAttempt?: () => Promise<void>,
  ): Promise<T> {
    let attempt = 0;
    let rateLimitAttempt = 0;

    for (;;) {
      try {
        // Hook opcional (solo lo usa `fetchOrderDetail`): se ejecuta justo
        // antes de encolar en `globalLimit`, en CADA intento (incluido el
        // primero y cada reintento), para minimizar la ventana entre
        // "decidir pedir" y "pedir de verdad".
        await beforeAttempt?.();

        // TODA petición a VTEX pasa por el límite global (`globalLimit`),
        // sin importar de qué tienda/segmento venga, ni de si es una
        // consulta de listado o de detalle. Esto es lo que evita que 6
        // tiendas (y, dentro de Pilatos, sus 10 fuentes, más el
        // enriquecimiento de ciudad corriendo en paralelo) disparen una
        // ráfaga simultánea que exceda lo que VTEX tolera.
        const response = await this.globalLimit(() =>
          firstValueFrom(
            this.httpService.get<T>(url, {
              timeout: this.requestTimeoutMs,
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-VTEX-API-AppKey': store.appKey as string,
                'X-VTEX-API-AppToken': store.appToken as string,
              },
              params,
            }),
          ),
        );

        return response.data;
      } catch (error) {
        const isRateLimit = this.isRateLimitError(error);

        if (isRateLimit) {
          rateLimitAttempt += 1;
          if (rateLimitAttempt > this.rateLimitMaxRetries) {
            throw this.toDescriptiveError(error, store.id, context);
          }
          // Backoff exponencial (2s, 4s, 8s, 16s...) o el valor de
          // `Retry-After` si VTEX lo envía — un 429 significa "más lento",
          // reintentar rápido casi siempre vuelve a fallar.
          const backoffMs = this.computeRateLimitBackoffMs(error, rateLimitAttempt);
          this.logger.warn(
            `[${store.id}] Rate limit (429) en ${context} (intento ${rateLimitAttempt}/${this.rateLimitMaxRetries}), esperando ${backoffMs}ms antes de reintentar.`,
          );
          await this.sleep(backoffMs);
          continue;
        }

        attempt += 1;
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt > this.maxRetries) {
          throw this.toDescriptiveError(error, store.id, context);
        }

        const backoffMs = 300 * attempt;
        this.logger.warn(
          `[${store.id}] Reintentando ${context} (intento ${attempt}/${this.maxRetries}) tras error: ${this.describeError(
            error,
          )}`,
        );
        await this.sleep(backoffMs);
      }
    }
  }

  private computeRateLimitBackoffMs(error: unknown, attempt: number): number {
    const axiosError = error as AxiosError;
    const retryAfterHeader = axiosError?.response?.headers?.['retry-after'];
    if (retryAfterHeader) {
      const seconds = Number(retryAfterHeader);
      if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
    // Exponencial: base * 2^(attempt-1) → 2s, 4s, 8s, 16s, 32s con la base default.
    return this.rateLimitBackoffBaseMs * Math.pow(2, attempt - 1);
  }

  private validateResponseShape(data: VtexOrdersResponse, storeId: string, page: number): void {
    if (!data || !Array.isArray(data.list) || !data.paging) {
      throw new Error(
        `Respuesta inesperada de VTEX para la tienda "${storeId}" en la página ${page}: estructura inválida`,
      );
    }
  }

  private isRateLimitError(error: unknown): boolean {
    const axiosError = error as AxiosError;
    return axiosError?.response?.status === RATE_LIMIT_STATUS;
  }

  private isRetryableError(error: unknown): boolean {
    const axiosError = error as AxiosError;
    if (axiosError?.code === 'ECONNABORTED' || axiosError?.code === 'ETIMEDOUT') {
      return true;
    }
    const status = axiosError?.response?.status;
    if (status && RETRYABLE_STATUS_CODES.has(status)) {
      return true;
    }
    // Errores de red sin respuesta (DNS, conexión rechazada, etc.)
    return !axiosError?.response && !!axiosError?.request;
  }

  private toDescriptiveError(error: unknown, storeId: string, context: string): VtexRequestError {
    const axiosError = error as AxiosError;
    const status = axiosError?.response?.status;
    const statusText = status ? ` (HTTP ${status})` : '';
    return new VtexRequestError(
      `Error consultando VTEX para la tienda "${storeId}" en ${context}${statusText}: ${this.describeError(
        error,
      )}`,
      status,
    );
  }

  private describeError(error: unknown): string {
    const axiosError = error as AxiosError;
    if (axiosError?.isAxiosError) {
      const status = axiosError.response?.status;
      const message = axiosError.message;
      // Nunca se registran headers/credenciales, solo status y mensaje genérico.
      return status ? `HTTP ${status} - ${message}` : message;
    }
    return error instanceof Error ? error.message : 'Error desconocido';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
