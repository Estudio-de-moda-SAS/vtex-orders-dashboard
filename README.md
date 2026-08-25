# Dashboard consolidado de órdenes VTEX

Aplicación web para consultar, consolidar y visualizar órdenes de seis
cuentas VTEX (Pilatos, Kipling, Diesel, Superdry, Girbaud y Replay) a partir
de un rango de fechas.

## 1. Qué hace el proyecto

El usuario selecciona una fecha inicial y una fecha final y presiona
**Consultar**. El backend consulta en paralelo (con concurrencia controlada)
las órdenes de las seis tiendas VTEX para ese rango, pagina automáticamente
hasta obtener todas las órdenes, calcula indicadores agregados por tienda
(total de órdenes, órdenes por status, valor facturado, medios de pago) y
entrega al frontend únicamente esa información consolidada — nunca la lista
cruda de órdenes ni ninguna credencial.

Si una tienda falla, las demás se muestran con normalidad y la tienda con
error se marca claramente en el dashboard.

## 2. Arquitectura

```text
vtex-orders-dashboard/
├── backend/     → NestJS + TypeScript. Único responsable de hablar con VTEX.
├── frontend/    → Next.js + TypeScript. Solo habla con el backend.
├── docker-compose.yml
└── README.md
```

### Backend (NestJS)

```text
backend/src/
├── config/
│   ├── configuration.ts     # Config general (puerto, CORS, concurrencia, caché)
│   └── stores.config.ts     # Configuración centralizada de las 6 tiendas
├── common/
│   ├── filters/              # Filtro global de excepciones
│   └── utils/                 # Fechas/zona horaria y caché en memoria
├── modules/
│   ├── orders/
│   │   ├── controllers/       # GET /api/orders/dashboard
│   │   ├── services/
│   │   │   ├── vtex-orders.service.ts       # HTTP + paginación + retries hacia VTEX
│   │   │   ├── orders-analytics.service.ts  # Cálculo de indicadores
│   │   │   └── orders.service.ts            # Orquesta las 6 tiendas en paralelo
│   │   ├── dto/                # Validación de query params
│   │   └── interfaces/         # Tipos de órdenes VTEX y de la respuesta del dashboard
│   └── stores/                 # GET /api/stores (info pública, sin credenciales)
├── app.module.ts
└── main.ts
```

**Flujo de una consulta:**

1. El frontend llama `GET /api/orders/dashboard?startDate=...&endDate=...`.
2. `OrdersController` valida el rango de fechas.
3. `OrdersService` consulta las 6 tiendas en paralelo (máx. `VTEX_STORE_CONCURRENCY`
   simultáneas) usando `VtexOrdersService`.
4. `VtexOrdersService` pide la página 1, lee `paging.pages` y pide el resto de
   páginas con concurrencia limitada (`VTEX_PAGE_CONCURRENCY`), reintentando
   errores temporales (5xx, timeouts, errores de red) hasta `VTEX_MAX_RETRIES`
   veces, y deduplica por `orderId`.
5. `OrdersAnalyticsService` transforma las órdenes en indicadores agregados
   por tienda.
6. `OrdersService` ensambla la respuesta final y la cachea en memoria por
   `store + startDate + endDate` durante `CACHE_TTL_MS`.
7. Si una tienda falla en cualquier punto del proceso, se captura el error y
   se retorna `{ success: false, error }` para esa tienda sin afectar a las
   demás.

### Frontend (Next.js, App Router)

```text
frontend/src/
├── app/                 # layout.tsx, page.tsx, globals.css
├── components/          # Un componente por responsabilidad visual
├── services/
│   └── orders.service.ts   # Único punto de acceso HTTP al backend
├── types/               # Tipos que reflejan el contrato del backend
└── lib/                 # Formateo de moneda/fecha/status
```

Ningún componente construye URLs ni llama `fetch` directamente: todo pasa
por `orders.service.ts`.

## 3. Seguridad

- `X-VTEX-API-AppKey` y `X-VTEX-API-AppToken` **solo existen en el backend**,
  cargados desde variables de entorno.
- El frontend nunca recibe, envía ni almacena esas credenciales. No se usan
  variables `NEXT_PUBLIC_*` para nada relacionado con VTEX.
- El backend nunca registra (`log`) API keys ni tokens; los mensajes de error
  que llegan al frontend son genéricos (status HTTP y mensaje descriptivo,
  sin headers).

## 4. Instalación

Requisitos:
- **Backend: Node.js 22.5 o superior** (usa el módulo `node:sqlite` integrado
  en Node para el caché histórico — ver sección 13 — que requiere esa
  versión mínima; no requiere instalar Python ni herramientas de
  compilación, a diferencia de otros paquetes SQLite para Node).
- **Frontend: Node.js 18 o superior.**
- npm (o yarn, manteniendo consistencia).

Si `node -v` te muestra una versión menor a 22.5, instala la LTS más
reciente desde nodejs.org antes de continuar con el backend.

### Backend

```bash
cd backend
npm install
cp .env.example .env   # completar con las credenciales reales de cada tienda
npm run start:dev
```

El backend queda en `http://localhost:3001`. Al arrancar verás un aviso
`ExperimentalWarning: SQLite is an experimental feature` — es esperado, no
es un error (ver sección 13).

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # opcional si el backend corre en otro host/puerto
npm run dev
```

El frontend queda en `http://localhost:3000`.

## 5. Variables de entorno

### Backend (`backend/.env`)

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del backend | `3001` |
| `FRONTEND_ORIGIN` | Origen(es) permitidos por CORS, separados por coma | `http://localhost:3000` |
| `VTEX_PAGE_CONCURRENCY` | Páginas simultáneas por ventana de fechas (no global) | `3` |
| `VTEX_STORE_CONCURRENCY` | Tiendas consultadas en paralelo | `3` |
| `VTEX_GLOBAL_CONCURRENCY` | Límite de concurrencia GLOBAL, compartido entre todas las tiendas y segmentos — el control más importante contra HTTP 429 (ver sección 8.1) | `4` |
| `VTEX_PER_PAGE` | Órdenes por página solicitadas a VTEX (más alto = menos peticiones para el mismo volumen, ver sección 8) | `50` |
| `VTEX_REQUEST_TIMEOUT_MS` | Timeout por request a VTEX | `15000` |
| `VTEX_MAX_RETRIES` | Reintentos ante errores transitorios genéricos (timeout, 5xx) | `2` |
| `VTEX_RATE_LIMIT_BACKOFF_MS` | Backoff base (ms) ante un HTTP 429, con crecimiento exponencial (ver sección 8.1) | `2000` |
| `VTEX_RATE_LIMIT_MAX_RETRIES` | Reintentos permitidos específicamente ante un 429, independiente de `VTEX_MAX_RETRIES` | `5` |
| `LIVE_QUERY_DEDUPE_TTL_MS` | Cuánto tiempo se reutiliza el resultado de una consulta en vivo idéntica en vez de repetirla (ver sección 8.1) | `30000` |
| `VTEX_PAGE_RETRY_SWEEPS` | Rondas adicionales de reintento solo para páginas que ya agotaron sus reintentos individuales (ver sección 8) | `3` |
| `VTEX_MAX_SAFE_OFFSET` | Offset máximo (`(page-1)*per_page`) considerado seguro antes de partir el rango de fechas en dos (ver sección 8) | `1400` |
| `VTEX_MIN_CHUNK_MINUTES` | Duración mínima de una sub-ventana antes de dejar de partir el rango | `5` |
| `VTEX_MAX_SPLIT_DEPTH` | Profundidad máxima de partición recursiva del rango de fechas | `12` |
| `VTEX_MONEY_DIVISOR` | Divisor para normalizar `totalValue` a la unidad real de la moneda (ver sección 11) | `1000` |
| `VTEX_CITY_ENRICHMENT_BATCH_SIZE` | Órdenes por lote en el enriquecimiento de ciudad en segundo plano (ver sección 13.1) | `1` |
| `VTEX_CITY_ENRICHMENT_BATCH_PAUSE_MS` | Pausa (ms) entre lotes, y mientras se espera a que no haya tráfico de listado en curso (ver sección 13.1) | `150` |
| `DB_PATH` | Ruta del archivo SQLite del caché histórico (ver sección 13) | `./data/cache.sqlite` |
| `IMMUTABILITY_WINDOW_DAYS` | Días antes de "hoy" que se consideran todavía mutables (el resto se cachea para siempre) | `40` |
| `INLINE_BACKFILL_MAX_DAYS` | Días "cerrados" sin sincronizar a partir de los cuales se usa un job de fondo en vez de sincronizar en línea | `3` |
| `NIGHTLY_SYNC_HOUR` | Hora (0-23, UTC) a la que corre la sincronización automática nocturna | `1` |
| `<TIENDA>_APP_KEY` / `<TIENDA>_APP_TOKEN` | Credenciales VTEX por tienda | — |
| `<TIENDA>_ENVIRONMENT` | Ambiente VTEX por tienda | `vtexcommercestable` |

### Frontend (`frontend/.env.local`)

| Variable | Descripción | Default |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | URL pública del backend (no de VTEX) | `http://localhost:3001` |

## 6. Cómo configurar las seis tiendas

Las credenciales se completan en `backend/.env`:

```env
PILATOS_APP_KEY=...
PILATOS_APP_TOKEN=...

KIPLING_APP_KEY=...
KIPLING_APP_TOKEN=...

DIESEL_APP_KEY=...
DIESEL_APP_TOKEN=...

SUPERDRY_APP_KEY=...
SUPERDRY_APP_TOKEN=...

GIRBAUD_APP_KEY=...
GIRBAUD_APP_TOKEN=...

REPLAY_APP_KEY=...
REPLAY_APP_TOKEN=...
```

Sin credenciales, cada tienda simplemente aparece con `success: false` y un
mensaje de error claro; el resto de la aplicación sigue funcionando.

## 7. Endpoints disponibles

### `GET /api/stores`

Retorna la lista de tiendas configuradas (id, nombre, color, si tiene
credenciales cargadas). Nunca incluye credenciales.

```json
[
  { "id": "pilatos", "name": "Pilatos", "color": "#F5C400", "configured": true }
]
```

### `GET /api/orders/dashboard?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&forceRefresh=false`

Valida que ambas fechas existan, sean válidas y que `startDate <= endDate`.
Acepta también fechas ISO 8601 completas si se necesita mayor precisión.

Internamente resuelve cada tienda combinando caché histórico local (SQLite)
+ consulta en vivo de los días recientes (ver sección 13). Si el rango
pedido tiene mucho histórico nunca sincronizado, la respuesta llega de
inmediato con lo que ya haya disponible y `data.syncInProgress: true` +
`data.syncJobId` en las tiendas afectadas — hay que sondear
`GET /api/sync/jobs/:id` y volver a pedir el dashboard cuando termine.

`forceRefresh=true` ignora el caché para el rango pedido y vuelve a
consultar VTEX incluso para días marcados como cerrados (botón de
"Forzar actualización" del frontend).

**Ejemplo de consulta:**

```text
GET /api/orders/dashboard?startDate=2026-06-01&endDate=2026-06-30
```

**Ejemplo de respuesta (resumida):**

```json
{
  "filters": {
    "startDate": "2026-06-01T05:00:00.000Z",
    "endDate": "2026-07-01T04:59:59.999Z"
  },
  "summary": {
    "totalOrders": 1250,
    "totalRevenueOrders": 980,
    "totalRevenueValue": 850000000,
    "storesQueried": 6,
    "storesWithErrors": 1,
    "storesWithIncompleteData": 0,
    "storesSyncing": 1
  },
  "stores": [
    {
      "id": "pilatos",
      "name": "Pilatos",
      "color": "#F5C400",
      "success": true,
      "data": {
        "totalOrders": 250,
        "revenueOrders": 200,
        "revenueTotalValue": 85000000,
        "currencyCode": "COP",
        "statusCounts": { "invoiced": 160, "payment-approved": 40, "handling": 30, "canceled": 20 },
        "paymentMethods": {
          "Mastercard": { "count": 80, "percentage": 32 },
          "Visa": { "count": 60, "percentage": 24 }
        },
        "responseTimeMs": 4210,
        "isConsistent": true,
        "isComplete": false,
        "syncInProgress": true,
        "syncJobId": "f28add8f-b236-4bab-beb7-f9990f5a6b61",
        "pendingClosedDays": 118
      }
    },
    {
      "id": "diesel",
      "name": "Diesel",
      "color": "#D32F2F",
      "success": false,
      "error": "Credenciales no configuradas para la tienda \"diesel\". Verifique las variables de entorno."
    }
  ],
  "segments": [
    {
      "id": "pilatos:seller:ARMO STUDIO",
      "storeId": "pilatos",
      "label": "Armo studio",
      "type": "seller",
      "success": true,
      "data": { "totalOrders": 12, "revenueOrders": 10, "revenueTotalValue": 3200000, "...": "..." }
    },
    {
      "id": "pilatos:marketplace:25",
      "storeId": "pilatos",
      "label": "Agaval",
      "type": "marketplace",
      "success": true,
      "data": { "totalOrders": 8, "revenueOrders": 7, "revenueTotalValue": 1800000, "...": "..." }
    }
  ],
  "generatedAt": "2026-06-30T10:00:00.000Z"
}
```

### `GET /api/sync/jobs/:id`

Consulta el progreso de un job de sincronización en segundo plano
(backfill histórico grande). Retorna `404` si el id no existe.

```json
{
  "id": "f28add8f-b236-4bab-beb7-f9990f5a6b61",
  "label": "backfill:pilatos:2025-01-01T05:00:00.000Z:2025-12-31T04:59:59.999Z",
  "status": "running",
  "totalDays": 325,
  "completedDays": 118,
  "createdAt": "2026-06-30T10:00:00.000Z",
  "updatedAt": "2026-06-30T10:02:15.000Z"
}
```

`status` puede ser `pending`, `running`, `completed` o `failed` (con
`error` describiendo qué pasó, sin credenciales ni datos sensibles). El
mismo endpoint sirve para consultar el progreso del enriquecimiento de
ciudad (sección 13.1), que reutiliza esta misma tabla `sync_jobs`.

### `POST /api/sync/enrich-cities`

Dispara manualmente el backfill retroactivo de ciudad de envío sobre todas
las órdenes ya cacheadas que todavía no la tengan resuelta (ver sección
13.1). Responde `202` de inmediato con el job (o un mensaje si no había
nada pendiente) — no espera a que termine.

## 8. Cómo funciona la paginación

Hay dos problemas distintos que pueden hacer que falten órdenes, y cada uno
se resuelve de forma diferente:

**1. Fallas transitorias** (rate-limit, timeouts, errores 5xx puntuales):
cada página reintenta hasta `VTEX_MAX_RETRIES` veces con backoff creciente,
y si eso no alcanza, se ejecutan hasta `VTEX_PAGE_RETRY_SWEEPS` rondas
adicionales completas solo sobre las páginas que quedaron pendientes.

**2. Paginación profunda** (la causa más probable en tiendas con muchas
órdenes): VTEX pagina por offset (`(page-1)*per_page`), y este tipo de
paginación se vuelve inestable en motores de búsqueda tipo Elasticsearch
—que es lo que hay detrás del listado de órdenes de VTEX— cuando el offset
es muy profundo. A diferencia de una falla transitoria, **reintentar la
misma página profunda no ayuda**: va a fallar de la misma forma cada vez,
porque no es un problema de red sino un límite estructural del motor de
búsqueda ante offsets grandes.

Para evitarlo, antes de paginar una ventana de fechas se calcula qué tan
profundo (`(pages-1)*per_page`) tendría que llegar. Si supera
`VTEX_MAX_SAFE_OFFSET`, el rango de fechas se **parte automáticamente en
dos mitades** (por el punto medio en el tiempo) y cada mitad se consulta
por separado — recursivamente, hasta `VTEX_MAX_SPLIT_DEPTH` niveles o hasta
llegar a una ventana mínima de `VTEX_MIN_CHUNK_MINUTES`. Así, ninguna
sub-consulta individual necesita paginar más allá del offset seguro. Al
final, todas las sub-ventanas se combinan (deduplicadas por `orderId`).

Los pasos completos son:

1. Se solicita la página 1 de la ventana de fechas actual (inicialmente,
   todo el rango pedido por el usuario).
2. Si `(paging.pages - 1) * per_page` supera `VTEX_MAX_SAFE_OFFSET`, la
   ventana se parte en dos mitades y se repite el proceso para cada una
   (paso 1) — antes de pedir ninguna otra página de la ventana original.
3. Cuando una ventana ya es lo bastante chica (o no se puede partir más),
   se paginan sus páginas restantes con concurrencia controlada
   (`VTEX_PAGE_CONCURRENCY`) y con los reintentos/rondas del punto 1.
4. Las órdenes de todas las páginas y sub-ventanas se combinan en un `Map`
   indexado por `orderId`, lo que elimina duplicados automáticamente.
5. Si al final alguna página nunca se pudo descargar, o el total obtenido
   no coincide con lo que VTEX reportó, la tienda se marca con
   `isComplete: false` y `pagesFailed > 0`. El frontend muestra esto de
   forma visible (banner en el resumen global y advertencia en la tarjeta
   de la tienda) en vez de mostrar un total silenciosamente incompleto.

**Nota importante:** `VTEX_MAX_SAFE_OFFSET` (default `1400`) es una
salvaguarda heurística y configurable, no un límite oficial documentado
por VTEX. Este valor se calibró con evidencia real: en una cuenta VTEX se
observó HTTP 400 consistente a partir del offset 1500 (página 31 con
`per_page=50`) — la página 30 (offset 1450) funcionaba sin problema. Si
en tus logs ves HTTP 400 sistemáticamente a partir de la misma página (no
aleatorio, no un 429/500), es este mismo límite duro — ajusta
`VTEX_MAX_SAFE_OFFSET` hacia abajo hasta quedar por debajo de donde
empieza a fallar.

### Errores permanentes (HTTP 400/401/403/404/422) vs. errores transitorios

Es importante no tratar estos dos casos igual, porque la respuesta
correcta es distinta:

- **Errores transitorios** (timeout, 429, 500, 502, 503, 504): pueden
  resolverse esperando y reintentando — por eso tienen todo el mecanismo
  de reintentos y rondas descrito arriba.
- **Errores permanentes** (400, 401, 403, 404, 422): VTEX está rechazando
  la petición de forma estructural — reintentarla, sin importar cuánto se
  espere, nunca va a funcionar. El caso real que evidenció esto: un HTTP
  400 consistente en 4 rondas de reintento (con backoff de 1s, 2s, 3s)
  sobre las mismas 10 páginas, perdiendo ~7 segundos sin ninguna
  posibilidad real de éxito.

Por eso, un error permanente se detecta y se deja de reintentar de
inmediato (no consume rondas de sweep en vano), y además dispara una
**salvaguarda reactiva**: si ocurre un HTTP 400 aunque el offset calculado
no superara `VTEX_MAX_SAFE_OFFSET` (es decir, nuestro umbral configurado
resultó estar mal calibrado para esa cuenta), el sistema parte el rango de
fechas en dos mitades de todas formas y reintenta — la evidencia real de
un 400 es más confiable que cualquier umbral configurado de antemano. Así,
el sistema se auto-corrige incluso si `VTEX_MAX_SAFE_OFFSET` no es exacto.

### ¿Por qué no evitamos la paginación por completo?

VTEX no ofrece un endpoint de "traer todas las órdenes del rango sin
límite": siempre hay un tope de cuántas órdenes devuelve una sola llamada
(`per_page`), así que alguna forma de pedir en partes es inevitable
cuando el volumen de órdenes supera ese tope. Lo que sí se puede reducir
es la CANTIDAD de peticiones necesarias, subiendo `VTEX_PER_PAGE` (el
default quedó en `50`; VTEX puede aceptar valores más altos, pero no hay
forma de confirmar en este momento cuál es su tope real documentado —
pruébalo empíricamente subiéndolo, por ejemplo, a 100, y si VTEX empieza a
rechazarlo o a comportarse distinto, bájalo de nuevo).

Importante: subir `per_page` reduce el NÚMERO de peticiones HTTP para el
mismo volumen de órdenes, pero NO cambia a partir de qué cantidad de
órdenes se activa la partición por fecha (`VTEX_MAX_SAFE_OFFSET` se mide
en posición de orden, no en número de página) — ambos mecanismos son
complementarios, no alternativos.

## 8.1. Rate limiting (HTTP 429) y datos "en vivo"

Con rangos de fechas incluso cortos (2-3 días) es posible ver una tienda
marcada como incompleta por errores `HTTP 429` (rate limit) en los logs.
Esto NO depende del tamaño del rango — depende de cuántas peticiones
simultáneas le llegan a VTEX en el momento en que se abre el dashboard.
Pilatos es la tienda más propensa a esto porque, además de su consulta
general, dispara 9 consultas adicionales (3 sellers + 6 marketplaces) —
ver sección 10.

### Por qué un 429 es distinto a cualquier otro error

Un 429 significa "estás pidiendo más rápido de lo que permito", no "algo
se rompió". Reintentar de inmediato (como se hacía antes, a los
300-600ms) casi siempre vuelve a fallar, porque la ventana de la que
depende el límite de VTEX probablemente sigue activa. Por eso el 429 se
trata aparte, con:

- **Backoff exponencial** (`VTEX_RATE_LIMIT_BACKOFF_MS`, default 2s, 4s,
  8s, 16s, 32s...) en vez del backoff corto de errores genéricos, o el
  valor de la cabecera `Retry-After` si VTEX la envía.
- **Su propio presupuesto de reintentos** (`VTEX_RATE_LIMIT_MAX_RETRIES`,
  default 5) — más generoso que `VTEX_MAX_RETRIES`, porque esperar más
  tiempo no cuesta corrección, solo velocidad.

### Límite de concurrencia GLOBAL

El control más importante: `VtexOrdersService` es un singleton (una sola
instancia para toda la aplicación), así que su límite de concurrencia
(`VTEX_GLOBAL_CONCURRENCY`, default 4) se comparte entre **todas** las
tiendas y **todos** los segmentos. Sin importar cuántas tiendas se
consulten en paralelo (`VTEX_STORE_CONCURRENCY`) o cuántas páginas se
pidan a la vez dentro de una ventana (`VTEX_PAGE_CONCURRENCY`), nunca hay
más de `VTEX_GLOBAL_CONCURRENCY` peticiones a VTEX en vuelo al mismo
tiempo en toda la app. Esto es necesario porque la evidencia (dos tiendas
distintas recibiendo 429 casi al mismo segundo) sugiere que el límite de
VTEX no es estrictamente "por tienda".

Si sigues viendo 429 con frecuencia, baja `VTEX_GLOBAL_CONCURRENCY` (por
ejemplo a 2 o 3). Si nunca los ves y quieres que el dashboard cargue más
rápido, puedes subirlo — no hay forma de confirmar el límite exacto de tu
cuenta VTEX sin probarlo empíricamente.

### Deduplicación de consultas en vivo

Si varias personas abren el dashboard casi al mismo tiempo (o una persona
refresca varias veces seguidas), cada una dispararía su propia consulta
idéntica a VTEX — empeorando justo el problema del 429. `LiveQueryDedupeCache`
evita esto: si ya hay una consulta idéntica (misma tienda, misma fuente,
misma ventana de fechas) en curso o recién completada dentro de
`LIVE_QUERY_DEDUPE_TTL_MS` (default 30s), se reutiliza ese resultado en
vez de generar tráfico adicional hacia VTEX.

### Exactitud vs. datos "en vivo": qué significa realmente "incompleto"

Este punto es importante para no generar falsas alarmas. Se distinguen
dos situaciones que antes se trataban igual:

- **Falla real**: una página nunca se pudo descargar (`pagesFailed > 0`).
  Esto SÍ marca la fuente como incompleta — es un error genuino y vale la
  pena reintentar ("Forzar actualización").
- **Drift esperado en datos en vivo**: VTEX reportó, por ejemplo, "hay 464
  órdenes" al pedir la página 1, pero al terminar de traer todas las
  páginas (unos segundos después) el conteo real es 463 o 465 — sin que
  ninguna página haya fallado. Esto pasa en cualquier tienda con
  movimiento activo: es una foto de un instante específico, no un error
  de nuestro sistema. **No se oculta ni se ajusta ningún número** — se
  sigue mostrando el total real obtenido — pero ya no se marca como
  "incompleto", porque no lo es. El frontend muestra en su lugar un aviso
  permanente y neutral ("datos tomados a las HH:MM, pueden variar
  levemente") en vez de una alerta de error.

Para los días ya "cerrados" (históricos, fuera de la ventana de
inmutabilidad) esta distinción no aplica: ahí se exige coincidencia exacta
siempre, porque esos datos ya no deberían estar cambiando — cualquier
discrepancia ahí sí es un error real.

## 9. Cómo se calculan los indicadores

- **`totalOrders`**: cantidad de órdenes únicas obtenidas para la tienda (o
  para el segmento, en el caso de sellers/marketplaces), sin importar su
  status.
- **`statusCounts`**: conteo de órdenes agrupadas por `status`. Se valida
  que `sum(statusCounts) === totalOrders`; si no coincide, `isConsistent`
  se marca en `false` y se registra una advertencia en los logs del backend.
- **`revenueOrders` / `revenueTotalValue`**: cantidad y suma de `totalValue`
  de las órdenes cuyo estado está entre los "contabilizados": `invoiced`,
  `payment-approved`, `handling` y `checking-invoice`. La coincidencia se
  valida tanto contra `status` (código) como contra `statusDescription`
  (texto legible), por si el código exacto varía entre cuentas VTEX — ver
  `backend/src/config/revenue-status.config.ts` para ajustar la lista.
  Los valores de `totalValue` originales de VTEX nunca se modifican en la
  fuente; solo se normalizan internamente para el cálculo (ver sección 11).
- **`paymentMethods`**: agrupación por `paymentNames`. Si una orden reporta
  varios medios de pago separados por coma, se cuenta en cada uno de ellos
  (sin inflar `totalOrders`), y el porcentaje se calcula sobre el total de
  menciones de medios de pago, no sobre `totalOrders`.

## 10. Cómo agregar una nueva tienda

1. Agregar una entrada nueva en `backend/src/config/stores.config.ts` con su
   `id`, `accountName`, `environment` y `color`.
2. Agregar `<ID>_APP_KEY`, `<ID>_APP_TOKEN` y `<ID>_ENVIRONMENT` en
   `backend/.env` y `backend/.env.example`.
3. Reiniciar el backend.

No se requiere ningún otro cambio: paginación, analítica, endpoints y
frontend leen la configuración de tiendas dinámicamente.

### Sellers y marketplaces (segmentación adicional)

Actualmente configurado solo para Pilatos, en
`backend/src/config/stores.config.ts` → `extraSegments`. Por cada tienda que
lo tenga configurado, además de la consulta general se ejecutan consultas
independientes:

- Una por cada `seller` en `extraSegments.sellers`, agregando el parámetro
  `f_sellerNames=<sellerName>` a la petición VTEX.
- Una por cada `marketplace` en `extraSegments.marketplaces`, agregando el
  parámetro `salesChannelId=<salesChannelId>`.

Todas esas órdenes se combinan (deduplicadas por `orderId`) con las de la
consulta general para calcular el total real de la tienda, y además se
exponen por separado en `segments` de la respuesta del dashboard, para las
tablas "Comparativo de sellers" y "Comparativo de marketplaces" del
frontend, ordenadas de mayor a menor valor contabilizado.

Para agregar esta segmentación a otra tienda, basta con completar su
`extraSegments` en `stores.config.ts`; el resto del mecanismo (paginación,
concurrencia, deduplicación, analítica, endpoints y las tablas del
frontend) ya está generalizado y no requiere cambios adicionales.

Los segmentos de una tienda se consultan secuencialmente entre sí (no en
paralelo), y cada uno respeta el límite de concurrencia GLOBAL
(`VTEX_GLOBAL_CONCURRENCY`) compartido con el resto de la aplicación — ver
sección 8.1 para el detalle de por qué esto es importante para evitar
HTTP 429, especialmente relevante para Pilatos por sus 9 fuentes
adicionales.

## 11. Formato de moneda y normalización de `totalValue`

Los valores en pesos colombianos se formatean con
`Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })`
(ej. `$24.997.000`). El formateo ocurre únicamente en el frontend.

**Normalización.** En algunas cuentas VTEX el campo `totalValue` del listado
de órdenes viene expresado en una unidad menor que la moneda real (por
ejemplo, milésimas). El síntoma es que las cifras de ventas facturadas
aparecen 1000 veces más grandes de lo real — por ejemplo, un total que en
realidad es "23 millones" se muestra como "23 mil millones".

Para corregirlo, el backend normaliza `totalValue` en un único punto de
entrada: `VtexOrdersService.mergeOrders()`, apenas las órdenes llegan de
VTEX (`backend/src/common/utils/money-normalizer.util.ts`). Como todo el
resto de la aplicación —analítica, KPIs, tarjetas por tienda, tabla
comparativa y los 4 gráficos— consume esas mismas órdenes ya normalizadas,
la corrección se refleja automáticamente en todos los casos sin tener que
duplicarla en ningún otro archivo.

El factor de corrección se controla con `VTEX_MONEY_DIVISOR` en `.env`:

| Valor | Cuándo usarlo |
|---|---|
| `1000` (default) | Las cifras de ventas aparecen ~1000 veces más grandes de lo real (caso más común reportado) |
| `100` | La cuenta VTEX entrega los valores en centavos (convención estándar documentada por VTEX) |
| `1` | Los valores ya vienen correctos, sin conversión |

Para calibrarlo con certeza: toma una orden real conocida, compara su
`totalValue` crudo (puedes verlo llamando directamente a la API de VTEX)
contra su valor real en pesos, y divide uno entre el otro para obtener el
divisor correcto.

Importante: los valores originales que entrega VTEX nunca se modifican en
la fuente; la normalización solo ajusta la copia interna que usa el
backend para calcular indicadores, tal como pide el punto 31 del brief
original.

## 12. Zona horaria

Colombia usa UTC-5 sin horario de verano. Cuando el usuario selecciona una
fecha (sin hora), el backend la interpreta como el inicio/fin de ese día en
la zona horaria de Colombia y la convierte a UTC antes de construir el
filtro `f_creationDate` de VTEX, evitando que la consulta incluya o excluya
órdenes de un día distinto al seleccionado.

**Importante:** el caché histórico (sección 13) agrupa las órdenes por
"día calendario de Colombia" (no UTC), de forma consistente con lo
anterior. Si esto no fuera consistente, el rango efectivamente consultado
a VTEX podía desviarse hasta ~24 horas del rango pedido por el usuario
(por ejemplo, pedir "15 al 18 de julio" terminaba consultando de facto
15 de julio 00:00 UTC a 19 de julio 23:59 UTC — un día completo de más).
Todas las funciones de fecha del backend (`common/utils/date-range.util.ts`)
usan el mismo criterio de "día calendario de Colombia" para evitar que
esto vuelva a pasar.

## 13. Caché histórico local (SQLite) y sincronización incremental

Este es el mecanismo que permite pedir rangos grandes (ej. "todo 2025" o
"todo el año") sin tener que volver a paginar miles de órdenes de VTEX en
cada consulta.

**Nota de implementación:** el caché usa el módulo SQLite integrado en
Node.js (`node:sqlite`, disponible desde Node 22.5+) en vez de un paquete
externo con módulo nativo compilado. Esto evita que instalar el proyecto
requiera Python o Visual Studio Build Tools en Windows — viene incluido en
el propio Node que ya tienes instalado. Al arrancar el backend vas a ver
un aviso `ExperimentalWarning: SQLite is an experimental feature` en la
consola — es normal y no afecta el funcionamiento, solo indica que la API
podría cambiar en futuras versiones de Node.

### La idea central

Una orden de hace varios meses ya no cambia (más allá de una ventana
razonable para devoluciones). Si ya se trajo una vez de VTEX, no hace
falta volver a pedirla — se guarda en un archivo SQLite local
(`backend/data/cache.sqlite` por defecto) y de ahí en adelante se lee
instantáneo, sin tocar VTEX para nada.

**Importante: esto no reemplaza a VTEX ni duplica su base de datos.** VTEX
sigue siendo el único dueño de la verdad sobre las órdenes. Este archivo es
solo una copia de lectura de lo histórico ya cerrado, para no tener que
volver a pedirle a VTEX (con su límite de páginas y velocidad) algo que ya
nos dio antes.

### Reglas

- **Ventana de inmutabilidad** (`IMMUTABILITY_WINDOW_DAYS`, default `40`
  días — un mes de garantía de devolución + margen): cualquier día anterior
  a `hoy - 40` se considera "cerrado". Una vez sincronizado exitosamente,
  nunca se vuelve a pedir a VTEX.
- **Ventana mutable**: los últimos 40 días (incluyendo hoy) siempre se
  consultan en vivo en cada petición, porque todavía podrían cambiar de
  estado.
- **Backfill en línea vs. en segundo plano**: si al pedir un rango hay
  pocos días cerrados sin sincronizar (`INLINE_BACKFILL_MAX_DAYS`, default
  `3`), se traen como parte de la misma petición HTTP. Si hay muchos (ej.
  la primera vez que alguien pide un año completo), se lanza un **job de
  fondo** que no bloquea la respuesta: el dashboard responde de inmediato
  con lo que ya haya en caché + la ventana mutable en vivo, marcando
  `syncInProgress: true` y un `syncJobId` en las tiendas afectadas. El
  frontend sondea `GET /api/sync/jobs/:id` cada par de segundos y refresca
  el dashboard automáticamente cuando el job termina.
- **Sincronización automática nocturna**: cada noche, a la hora configurada
  en `NIGHTLY_SYNC_HOUR` (default 1am UTC), un cron interno
  (`@nestjs/schedule`) sincroniza la ventana mutable completa de todas las
  tiendas (y sus segmentos), para que los datos recientes ya estén
  calientes en caché cuando alguien abra el dashboard en la mañana. Esto es
  adicional a la sincronización on-demand, no la reemplaza.
- **Botón "Forzar actualización"**: ignora el caché para el rango pedido y
  vuelve a consultar VTEX incluso para días marcados como cerrados (por si
  algo cambió después de la ventana de inmutabilidad — ej. una devolución
  fuera de plazo).

### Modelo de datos (SQLite)

- `orders`: una fila por orden, por tienda y por "fuente" (`main`, o un
  `seller`/`marketplace` específico de Pilatos), indexada por día
  (`day_bucket`). Deduplicada por `(store_id, source_type, source_key,
  order_id)`. Incluye una columna `city` (nullable) poblada de forma
  asíncrona por el enriquecimiento de ciudad — ver sección 13.1.
- `sync_watermarks`: qué días (por tienda/fuente) ya se sincronizaron
  completos y pueden leerse del caché sin volver a VTEX.
- `sync_jobs`: progreso de los backfills en segundo plano, persistido para
  sobrevivir un reinicio del backend a medio camino.

### Requisito de despliegue: disco persistente

El archivo SQLite necesita vivir en un disco que sobreviva reinicios y
redeploys. **No funciona en entornos "serverless" sin disco persistente**
(ej. Vercel serverless functions) — ahí el archivo se perdería entre
peticiones y toda la estrategia de caché se rompería. Funciona bien en:

- Un servidor propio o VM.
- Azure App Service (Linux) — usar la carpeta persistente `/home`. El tier
  gratuito F1 no soporta "Always On", lo que pondría en riesgo la
  sincronización nocturna; se recomienda al menos el tier Basic (B1).
- Railway u otra plataforma con volúmenes persistentes.

Con SQLite, evita ejecutar más de una instancia del backend en paralelo
escribiendo al mismo archivo (bloqueo de archivo entre procesos). Para este
caso de uso (dashboard interno, no una app pública masiva), correr una sola
instancia es más que suficiente. Si en el futuro el tráfico exige escalar
horizontalmente, ahí se migraría a una base de datos administrada (ej.
PostgreSQL) — no es necesario ahora.

### Cómo se ve un backfill grande en la práctica

1. Alguien pide "todo 2025" por primera vez → el dashboard responde de
   inmediato con lo que haya en caché (probablemente nada) + un banner de
   progreso ("Trayendo histórico por primera vez...").
2. El job de fondo va bajando día por día (con concurrencia acotada, para
   no saturar a VTEX), guardando cada día en SQLite y marcándolo como
   sincronizado.
3. El frontend sondea el progreso y, cuando termina, vuelve a pedir el
   dashboard automáticamente — ya instantáneo.
4. **La próxima vez que cualquiera pida 2025** (ese mismo día, la semana
   que viene, el año que viene), es instantáneo: todo ya está en caché.

Este costo de "primera vez" es inevitable — el cuello de botella es VTEX,
no el almacenamiento local — pero nunca se vuelve a pagar dos veces por el
mismo período.

## 13.1. Enriquecimiento de ciudad de envío

El listado `/api/oms/pvt/orders` (usado por toda la sincronización de la
sección 13) **no trae la ciudad de envío** de la orden — ese dato solo
existe en `shippingData.address.city` del detalle de cada orden
individual (`GET /api/oms/pvt/orders/{orderId}`). Pedirlo ahí para cada
orden, en cada consulta del dashboard, sería lentísimo y saturaría a VTEX.

**La idea central**, igual que con el caché histórico: la ciudad de una
orden nunca cambia una vez creada (a diferencia del `status`), así que se
trata como un enriquecimiento "una sola vez, para siempre" sobre las
órdenes que ya viven en `orders`. `OrderCityEnrichmentService`
(`backend/src/modules/sync/services/order-city-enrichment.service.ts`)
recorre en segundo plano las filas con `city IS NULL`, consulta el
detalle en VTEX, extrae y normaliza únicamente el campo `city` (nunca se
guarda ni se loguea el resto de la respuesta — no incluye ningún dato
personal del cliente), y actualiza la fila. Guarda `''` (string vacío,
distinto de `NULL`) cuando VTEX no reportó ciudad para esa orden (ej.
retiro en tienda), para no volver a intentarla en cada pasada.

**Baja prioridad REAL, no solo aproximada:** las peticiones de detalle
pasan por el mismo `globalLimit` que el resto de las consultas a VTEX (ver
sección 8.1) — nunca pueden, por sí solas, exceder lo que VTEX tolera. Pero
como ese límite es estrictamente FIFO (sin noción de prioridad), depender
solo de "lotes chicos + pausa" no bastaba: en producción se detectó que
podía demorar lo suficiente una consulta en vivo de Pilatos (`main` + 10
segmentos por consulta, la tienda con más fuentes simultáneas) como para
que su paginación — sobre una ventana que sigue mutando en tiempo real —
alcanzara a "correrse" entre página y página, perdiendo una orden sin que
se marcara como dato incompleto (el código trata ese tipo de discrepancia
como "drift esperado", no como error — ver sección 8.1).

La solución real tiene dos capas:

1. `OrderCityEnrichmentService` espera a que `VtexOrdersService.isListingBusy()`
   sea `false` antes de pedir un lote nuevo de la base de datos.
2. Dentro de `VtexOrdersService.fetchOrderDetail`, ese mismo chequeo se
   repite JUSTO ANTES de cada intento individual (el primero y cada
   reintento) — lo más cerca posible del `globalLimit()` real. Esto
   importa porque un lote de varias promesas concurrentes pasa el chequeo
   de la capa 1 casi en el mismo instante; si el tráfico real llega justo
   después, esas peticiones ya en curso no se pueden cancelar y siguen
   ocupando slots del límite global. Por eso `VTEX_CITY_ENRICHMENT_BATCH_SIZE`
   default es `1` (no `4` ni `24` como en iteraciones anteriores): así el
   peor caso posible es "1 de `VTEX_GLOBAL_CONCURRENCY` slots ocupado por
   mala suerte de timing", nunca más que eso. `VTEX_CITY_ENRICHMENT_BATCH_PAUSE_MS`
   (default `150`ms) es solo la pausa entre reintentos de "¿ya no hay
   tráfico?" y entre lotes, para no convertir la espera en un spin-loop
   pegado a la base de datos.

**Cómo se dispara** (siempre de forma no bloqueante, y sin duplicar un job
ya en curso):

1. Automáticamente al arrancar el backend, si quedan órdenes sin ciudad.
2. Automáticamente después de cada lote de órdenes cacheado durante la
   sincronización normal (sección 13).
3. Manualmente: `POST /api/sync/enrich-cities` (responde `202` de
   inmediato con el job; se puede sondear con `GET /api/sync/jobs/:id`,
   reutilizando la misma tabla `sync_jobs` de los backfills históricos).

**Resumibilidad:** como el job siempre selecciona `WHERE city IS NULL`, un
reinicio del backend a medio camino no repite trabajo ya hecho — al
arrancar, cualquier job huérfano (`pending`/`running` de un proceso
anterior) se marca `failed` y, si aún queda algo pendiente, se lanza uno
nuevo que retoma exactamente donde el archivo SQLite haya quedado.

## 14. Scripts

```bash
# Backend
cd backend
npm install
npm run start:dev     # desarrollo
npm run build && npm run start:prod   # producción

# Frontend
cd frontend
npm install
npm run dev            # desarrollo
npm run build && npm run start   # producción
```

## 15. Docker (opcional)

El repositorio incluye `Dockerfile` en `backend/` y `frontend/`, y un
`docker-compose.yml` de referencia en la raíz. No es obligatorio
contenerizar para ejecutar el proyecto localmente con Node.

**Importante:** `docker-compose.yml` monta `./backend/data` como volumen
en `/app/data` — ahí vive el archivo SQLite del caché histórico (ver
sección 13). Sin ese volumen, cada `docker compose down`/redeploy borraría
todo el histórico ya sincronizado y habría que volver a traerlo de VTEX
desde cero. Si despliegan sin Docker Compose (ej. directamente en Azure
App Service), asegúrense igual de que `DB_PATH` apunte a una carpeta con
disco persistente.
