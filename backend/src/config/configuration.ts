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
  };
  storage: {
    /** Ruta del archivo SQLite donde se cachea el histórico de órdenes. */
    dbPath: string;
    /**
     * Días antes de "hoy" que se consideran "todavía mutables" (una orden
     * podría cambiar de estado, ej. una devolución). Todo lo anterior a esta
     * ventana se trata como cerrado y se cachea para siempre; todo dentro de
     * la ventana se vuelve a consultar en VTEX cada vez.
     */
    immutabilityWindowDays: number;
    /**
     * Si al pedir un rango hay más de esta cantidad de días "cerrados" que
     * nunca se han sincronizado, la sincronización se hace en un job de
     * fondo (para no bloquear la petición HTTP) en vez de en línea.
     */
    inlineBackfillMaxDays: number;
    /** Hora (0-23, hora del servidor) a la que corre la sincronización automática nocturna. */
    nightlySyncHour: number;
    /**
     * Cuánto tiempo (ms) se reutiliza el resultado de una consulta EN VIVO
     * (ventana mutable) para la misma tienda/fuente/rango, en vez de
     * volver a pedirle lo mismo a VTEX. Protege contra el caso de varias
     * personas abriendo el dashboard casi al mismo tiempo.
     */
    liveQueryDedupeTtlMs: number;
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
    },
    storage: {
      dbPath: process.env.DB_PATH ?? './data/cache.sqlite',
      immutabilityWindowDays: parseInt(process.env.IMMUTABILITY_WINDOW_DAYS ?? '40', 10),
      inlineBackfillMaxDays: parseInt(process.env.INLINE_BACKFILL_MAX_DAYS ?? '3', 10),
      nightlySyncHour: parseInt(process.env.NIGHTLY_SYNC_HOUR ?? '1', 10),
      liveQueryDedupeTtlMs: parseInt(process.env.LIVE_QUERY_DEDUPE_TTL_MS ?? '30000', 10),
    },
  },
});
