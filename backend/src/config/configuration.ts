export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendOrigins: string[];
  vtex: {
    pageConcurrency: number;
    storeConcurrency: number;
    /**
     * Límite de concurrencia GLOBAL, compartido entre TODAS las tiendas y
     * TODOS los segmentos (ver `VtexOrdersService`). Es el control más
     * importante para evitar HTTP 429: sin importar cuántas tiendas se
     * consulten en paralelo, nunca hay más de esta cantidad de peticiones
     * a VTEX en vuelo al mismo tiempo en toda la aplicación.
     */
    globalConcurrency: number;
    perPage: number;
    requestTimeoutMs: number;
    maxRetries: number;
    /** Rondas adicionales de reintento SOLO para páginas que ya fallaron todos sus reintentos individuales. */
    pageRetrySweeps: number;
    /**
     * Backoff base (ms) para reintentar ante un HTTP 429 (rate limit),
     * con crecimiento exponencial (base * 2^intento). Un 429 significa
     * "más lento", no "algo se rompió" — por eso su backoff es mucho más
     * largo que el de una falla genérica.
     */
    rateLimitBackoffBaseMs: number;
    /** Reintentos permitidos específicamente ante un HTTP 429, independiente de `maxRetries`. */
    rateLimitMaxRetries: number;
    /**
     * Offset máximo (page-1)*per_page que se considera "seguro" para pedirle
     * a VTEX. Si una consulta necesitaría paginar más profundo que esto, el
     * rango de fechas se divide automáticamente en dos mitades. VTEX (como
     * muchos backends basados en Elasticsearch) puede volverse inestable o
     * fallar en offsets muy profundos; este valor es una salvaguarda
     * heurística y configurable, no un límite oficial documentado por VTEX.
     */
    maxSafeOffset: number;
    /** Duración mínima (en minutos) de una sub-ventana antes de dejar de partir el rango, para evitar recursión infinita. */
    minChunkMinutes: number;
    /** Profundidad máxima de partición recursiva del rango de fechas. */
    maxSplitDepth: number;
    /** Divisor para normalizar `totalValue` a la unidad real de la moneda. Ver money-normalizer.util.ts */
    moneyDivisor: number;
    /**
     * Cuántas órdenes procesa `OrderCityEnrichmentService` por lote. La
     * garantía real de no interferir con consultas en vivo es
     * `VtexOrdersService.isListingBusy()` (el job no encola nada mientras
     * haya tráfico de listado real) — este valor solo acota cuánto se
     * alcanza a encolar en la ventana entre que `isListingBusy()` se
     * pone en `false` y la siguiente consulta real llega. Se mantiene
     * cercano a `globalConcurrency` a propósito: un lote mucho más grande
     * que la concurrencia real solo agrega peticiones en cola sin
     * acelerar el throughput (ya limitado por `globalConcurrency`), y sí
     * aumenta cuánto puede demorar a una consulta que llegue justo
     * después.
     */
    cityEnrichmentBatchSize: number;
    /** Pausa (ms) entre lotes y mientras se espera a que `isListingBusy()` sea `false`. Ver `cityEnrichmentBatchSize`. */
    cityEnrichmentBatchPauseMs: number;
    /**
     * Cuántas veces reintentar una ventana COMPLETA (no solo páginas
     * fallidas) cuando el conteo de órdenes obtenido no coincide con el
     * total que VTEX reportó al iniciar, para una ventana ya CERRADA
     * (`closedWindowBufferMinutes` en el pasado — los datos ya no pueden
     * seguir cambiando). Confirmado en producción: VTEX (Elasticsearch)
     * puede ser inestable justo en el límite entre dos páginas incluso
     * para una ventana histórica ya cerrada, devolviendo una orden de más
     * o de menos según el intento — algo que un simple reintento de la
     * página fallida no soluciona (ninguna página "falla" con error, el
     * conteo total simplemente no cuadra), así que hace falta repetir la
     * consulta completa.
     */
    closedWindowRetries: number;
    /** Cuántos minutos deben haber pasado desde el fin de la ventana para considerarla "cerrada" (ver `closedWindowRetries`). */
    closedWindowBufferMinutes: number;
    /**
     * Cuántas órdenes de UNA MISMA tienda se enriquecen (detalle +
     * cálculo de items/descuentos) EN VUELO a la vez dentro de
     * `VtexSyncCronService.fetchAndAggregate` — ver el `pLimit` ahí. Sin
     * este techo, un `Promise.all` disparaba las 900+ órdenes de un día
     * pesado (ej. Pilatos) de una sola vez, manteniendo todos sus
     * resultados completos en memoria simultáneamente hasta que la
     * última terminara — uno de los dos factores confirmados detrás de
     * un `heap out of memory` visto en producción (el otro fue el
     * fallback de días faltantes, ver `onDemandLookbackDays`). No
     * reemplaza a `globalConcurrency` (que sigue acotando las peticiones
     * HTTP reales a VTEX) — este límite es sobre cuántos resultados YA
     * completos se acumulan a la vez antes de la agregación final.
     */
    orderEnrichConcurrency: number;
  };
  sync: {
    /** Cada cuántas horas corre el cron de sincronización con VTEX. */
    cronIntervalHours: number;
    /**
     * Cuántos días hacia atrás recalcula el cron en cada corrida (ventana
     * de recálculo, para capturar cambios de estado de órdenes recientes).
     * Los días fuera de esta ventana nunca se vuelven a tocar.
     */
    recalcWindowDays: number;
    /**
     * Hasta cuántos días hacia atrás (desde hoy) el dashboard sale a
     * VTEX en vivo cuando encuentra un día sin sincronizar (ver
     * `OrdersService.fillMissingDays`). Más allá de esta ventana, un día
     * sin fila en `sales_daily` se lee como 0 órdenes/ventas — nunca se
     * vuelve a consultar en vivo. Sin este corte, un día de venta
     * genuinamente cero (frecuente en tiendas de bajo volumen, ej.
     * Replay) nunca llega a tener fila propia, así que cada petición que
     * tocara esa fecha repetía la consulta en vivo PARA SIEMPRE — el
     * disparador real detrás de un `heap out of memory` observado en
     * producción (dos sincronizaciones completas corriendo a la vez: el
     * cron normal + este fallback pidiendo huecos desde enero).
     */
    onDemandLookbackDays: number;
  };
}

/**
 * Carga y normaliza la configuración general de la aplicación a partir
 * de variables de entorno. Todo valor con un `parseInt` cuenta con un
 * fallback seguro para que la aplicación arranque incluso si falta
 * alguna variable opcional.
 */
export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? '3001', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    frontendOrigins: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    vtex: {
      pageConcurrency: parseInt(process.env.VTEX_PAGE_CONCURRENCY ?? '3', 10),
      storeConcurrency: parseInt(process.env.VTEX_STORE_CONCURRENCY ?? '3', 10),
      globalConcurrency: parseInt(process.env.VTEX_GLOBAL_CONCURRENCY ?? '4', 10),
      perPage: parseInt(process.env.VTEX_PER_PAGE ?? '50', 10),
      requestTimeoutMs: parseInt(process.env.VTEX_REQUEST_TIMEOUT_MS ?? '15000', 10),
      maxRetries: parseInt(process.env.VTEX_MAX_RETRIES ?? '2', 10),
      pageRetrySweeps: parseInt(process.env.VTEX_PAGE_RETRY_SWEEPS ?? '3', 10),
      rateLimitBackoffBaseMs: parseInt(process.env.VTEX_RATE_LIMIT_BACKOFF_MS ?? '2000', 10),
      rateLimitMaxRetries: parseInt(process.env.VTEX_RATE_LIMIT_MAX_RETRIES ?? '5', 10),
      maxSafeOffset: parseInt(process.env.VTEX_MAX_SAFE_OFFSET ?? '1400', 10),
      minChunkMinutes: parseInt(process.env.VTEX_MIN_CHUNK_MINUTES ?? '5', 10),
      maxSplitDepth: parseInt(process.env.VTEX_MAX_SPLIT_DEPTH ?? '12', 10),
      moneyDivisor: parseInt(process.env.VTEX_MONEY_DIVISOR ?? '1000', 10),
      // Con `globalConcurrency=4`, el techo real de throughput ya lo pone
      // ESE límite (nunca hay más de 4 peticiones de detalle en vuelo,
      // pase lo que pase acá). Un lote chico (5) + pausa larga (500ms)
      // dejaba el límite global ocioso la mayor parte del tiempo — la
      // pausa importa para ceder el paso a una sincronización normal que
      // llegue mientras tanto, pero no hace falta pagarla en CADA lote de
      // solo 5 órdenes cuando el backlog histórico es de decenas de miles.
      // batchSize=1 a propósito: aunque `isListingBusy()` ahora se
      // re-chequea justo antes de CADA petición de detalle individual
      // (ver `fetchOrderDetail`), un lote de N promesas concurrentes las
      // dispara casi en el mismo instante — si a todas les toca pasar el
      // chequeo justo antes de que llegue tráfico real, N quedan en
      // vuelo a la vez, ocupando hasta N de los `globalConcurrency` slots
      // sin poder cancelarse. Con batchSize=1 el peor caso posible es
      // "1 de 4 slots ocupado por mala suerte de timing", nunca más.
      cityEnrichmentBatchSize: parseInt(process.env.VTEX_CITY_ENRICHMENT_BATCH_SIZE ?? '1', 10),
      cityEnrichmentBatchPauseMs: parseInt(process.env.VTEX_CITY_ENRICHMENT_BATCH_PAUSE_MS ?? '150', 10),
      closedWindowRetries: parseInt(process.env.VTEX_CLOSED_WINDOW_RETRIES ?? '2', 10),
      closedWindowBufferMinutes: parseInt(process.env.VTEX_CLOSED_WINDOW_BUFFER_MINUTES ?? '15', 10),
      orderEnrichConcurrency: parseInt(process.env.VTEX_ORDER_ENRICH_CONCURRENCY ?? '20', 10),
    },
    sync: {
      cronIntervalHours: parseInt(process.env.SYNC_CRON_INTERVAL_HOURS ?? '4', 10),
      recalcWindowDays: parseInt(process.env.SYNC_RECALC_WINDOW_DAYS ?? '3', 10),
      onDemandLookbackDays: parseInt(process.env.SYNC_ON_DEMAND_LOOKBACK_DAYS ?? '7', 10),
    },
  },
});
