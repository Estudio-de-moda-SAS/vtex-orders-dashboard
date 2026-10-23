# Dashboard consolidado de órdenes VTEX

Aplicación web para consultar, consolidar y visualizar órdenes de seis
cuentas VTEX (Pilatos, Kipling, Diesel, Superdry, Girbaud y Replay) a partir
de un rango de fechas.

## 1. Qué hace el proyecto

El usuario selecciona una fecha inicial y una fecha final y presiona
**Consultar**. El backend lee, directamente de Supabase (PostgreSQL),
agregados diarios ya pre-calculados por un cron interno — calcula
indicadores agregados por tienda (total de órdenes, órdenes por status,
valor facturado, medios de pago, ciudad, categoría, marca, colección,
descuento) y entrega al frontend únicamente esa información consolidada
— nunca la lista cruda de órdenes ni ninguna credencial. **El dashboard
nunca le habla a VTEX en el momento de la consulta** — ver sección 13.

Si una tienda no tiene datos para el rango pedido, se muestra con
normalidad (totales en cero); si su última sincronización con VTEX falló,
se marca claramente en el dashboard (`isComplete: false`).

## 2. Arquitectura

```text
vtex-orders-dashboard/
├── backend/     → NestJS + TypeScript. Único responsable de hablar con VTEX (solo el cron).
├── frontend/    → Next.js + TypeScript. Solo habla con el backend.
├── docker-compose.yml
└── README.md
```

### Backend (NestJS)

```text
backend/src/
├── config/
│   ├── configuration.ts     # Config general (puerto, CORS, concurrencia VTEX, cron)
│   └── stores.config.ts     # Configuración centralizada de las 6 tiendas (+ colecciones)
├── common/
│   ├── aggregation/           # daily-aggregator.ts (reglas de negocio de agregación, compartidas
│   │                            entre el cron y el importador de Excel) + types.ts
│   ├── filters/                # Filtro global de excepciones
│   └── utils/                  # Fechas/zona horaria, descuento, normalización de dinero/ciudad,
│                                # extracción de detalle de orden VTEX
├── modules/
│   ├── database/                # Pool de `pg` + repositorios sobre Supabase + migraciones SQL
│   ├── vtex/                    # VtexOrdersService (HTTP + paginación + retries hacia VTEX)
│   ├── sync/                    # VtexSyncCronService — el cron, única pieza que habla con VTEX
│   ├── catalog/                 # Árbol de categorías + colecciones (catalog_system/catalog VTEX)
│   ├── orders/
│   │   ├── controllers/         # GET /api/orders/dashboard, /api/analytics/*, /api/sync/status
│   │   ├── services/
│   │   │   ├── orders-analytics.service.ts  # Filas SQL → StoreDashboardData
│   │   │   ├── orders.service.ts            # Orquesta las consultas SQL del dashboard
│   │   │   └── product-analytics.service.ts # Descuento/categoría/marca desde agregados
│   │   ├── dto/                 # Validación de query params
│   │   └── interfaces/          # Tipos de la respuesta del dashboard y de VTEX
│   └── stores/                  # GET /api/stores (info pública, sin credenciales)
├── cli/
│   └── import-historical-orders.ts  # Script de importación histórica de Excel (ver sección 13.2)
├── app.module.ts
└── main.ts
```

**Flujo de una consulta al dashboard** (siempre lectura pura, sin VTEX):

1. El frontend llama `GET /api/orders/dashboard?startDate=...&endDate=...`.
2. `OrdersController` valida el rango de fechas.
3. `OrdersService` consulta `DashboardQueryRepository` (`SUM`/`GROUP BY`
   sobre `sales_daily*` en Supabase) para todas las tiendas a la vez.
4. `OrdersAnalyticsService` convierte esas filas SQL en la forma
   `StoreDashboardData` que consume el frontend.
5. `OrdersService` también consulta `sync_logs` (`SyncLogsRepository`)
   para exponer `lastSyncedAt`/`lastSyncStatus` por tienda.

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
  cargados desde variables de entorno, y solo los usa el cron
  (`VtexSyncCronService`) — el dashboard nunca los necesita, porque nunca
  llama a VTEX.
- El frontend nunca recibe, envía ni almacena esas credenciales. No se usan
  variables `NEXT_PUBLIC_*` para nada relacionado con VTEX.
- El backend nunca registra (`log`) API keys ni tokens; los mensajes de error
  que llegan al frontend son genéricos (status HTTP y mensaje descriptivo,
  sin headers).
- El importador de Excel (sección 13.2) descarta columnas con datos
  personales/de pago apenas lee cada fila — nunca las guarda ni las loguea.

## 4. Instalación

Requisitos:
- **Backend: Node.js 22.5 o superior.**
- **Frontend: Node.js 18 o superior.**
- npm (o yarn, manteniendo consistencia).
- Un proyecto de Supabase (PostgreSQL) — ver sección 13 para el connection
  string y cómo correr las migraciones.

### Backend

```bash
cd backend
npm install
cp .env.example .env   # completar con las credenciales VTEX y DATABASE_URL
npm run db:migrate     # crea las tablas en Supabase (ver sección 13)
npm run start:dev
```

El backend queda en `http://localhost:3001`.

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
| `DATABASE_URL` | Connection string del POOLER de Supabase, modo Transaction (puerto 6543) — ver sección 13 | — |
| `SYNC_CRON_INTERVAL_HOURS` | Cada cuántas horas corre el cron de sincronización con VTEX | `4` |
| `SYNC_RECALC_WINDOW_DAYS` | Días hacia atrás que el cron recalcula en cada corrida | `3` |
| `VTEX_PAGE_CONCURRENCY` | Páginas simultáneas por ventana de fechas (no global) | `3` |
| `VTEX_STORE_CONCURRENCY` | Tiendas consultadas en paralelo | `3` |
| `VTEX_GLOBAL_CONCURRENCY` | Límite de concurrencia GLOBAL, compartido entre todas las tiendas y segmentos — el control más importante contra HTTP 429 (ver sección 8.1) | `4` |
| `VTEX_PER_PAGE` | Órdenes por página solicitadas a VTEX (más alto = menos peticiones para el mismo volumen, ver sección 8) | `50` |
| `VTEX_REQUEST_TIMEOUT_MS` | Timeout por request a VTEX | `15000` |
| `VTEX_MAX_RETRIES` | Reintentos ante errores transitorios genéricos (timeout, 5xx) | `2` |
| `VTEX_RATE_LIMIT_BACKOFF_MS` | Backoff base (ms) ante un HTTP 429, con crecimiento exponencial (ver sección 8.1) | `2000` |
| `VTEX_RATE_LIMIT_MAX_RETRIES` | Reintentos permitidos específicamente ante un 429, independiente de `VTEX_MAX_RETRIES` | `5` |
| `VTEX_PAGE_RETRY_SWEEPS` | Rondas adicionales de reintento solo para páginas que ya agotaron sus reintentos individuales (ver sección 8) | `3` |
| `VTEX_MAX_SAFE_OFFSET` | Offset máximo (`(page-1)*per_page`) considerado seguro antes de partir el rango de fechas en dos (ver sección 8) | `1400` |
| `VTEX_MIN_CHUNK_MINUTES` | Duración mínima de una sub-ventana antes de dejar de partir el rango | `5` |
| `VTEX_MAX_SPLIT_DEPTH` | Profundidad máxima de partición recursiva del rango de fechas | `12` |
| `VTEX_MONEY_DIVISOR` | Divisor para normalizar `totalValue` a la unidad real de la moneda (ver sección 11) | `1000` |
| `<TIENDA>_APP_KEY` / `<TIENDA>_APP_TOKEN` | Credenciales VTEX por tienda | — |
| `<TIENDA>_ENVIRONMENT` | Ambiente VTEX por tienda | `vtexcommercestable` |

### Backend, solo para el importador local (`backend/.env.local`)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | La misma connection string de Supabase — el script de importación histórica corre desde tu máquina, no desde el backend desplegado, así que necesita su propio archivo de entorno (ver sección 13.2). |

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

Sin credenciales, el cron simplemente no sincroniza esa tienda (sus
agregados quedan en cero hasta que se configuren); el resto de la
aplicación sigue funcionando con normalidad.

## 7. Endpoints disponibles

### `GET /api/stores`

Retorna la lista de tiendas configuradas (id, nombre, color, si tiene
credenciales cargadas). Nunca incluye credenciales.

```json
[
  { "id": "pilatos", "name": "Pilatos", "color": "#F5C400", "configured": true }
]
```

### `GET /api/orders/dashboard?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Valida que ambas fechas existan, sean válidas y que `startDate <= endDate`.
Acepta también fechas ISO 8601 completas si se necesita mayor precisión.

Lectura SQL pura sobre los agregados diarios de Supabase — **nunca llama
a VTEX**. La frescura de los datos es la de la última corrida del cron
para cada tienda (`data.lastSyncedAt`/`data.lastSyncStatus`), no la del
momento de la consulta.

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
    "storesWithErrors": 0,
    "storesWithIncompleteData": 0
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
        "responseTimeMs": 42,
        "isConsistent": true,
        "isComplete": true,
        "lastSyncedAt": "2026-06-30T09:00:00.000Z",
        "lastSyncStatus": "success"
      }
    }
  ],
  "segments": [
    {
      "id": "pilatos:seller:disandina-s-a-s",
      "storeId": "pilatos",
      "label": "Disandina S.A.S",
      "type": "seller",
      "success": true,
      "data": { "totalOrders": 12, "revenueOrders": 10, "revenueTotalValue": 3200000 }
    },
    {
      "id": "pilatos:marketplace:agaval",
      "storeId": "pilatos",
      "label": "Agaval",
      "type": "marketplace",
      "success": true,
      "data": { "totalOrders": 8, "revenueOrders": 7, "revenueTotalValue": 1800000 }
    }
  ],
  "generatedAt": "2026-06-30T10:00:00.000Z"
}
```

### `GET /api/sync/status`

Última corrida del cron de sincronización VTEX por tienda —
`lastSyncedAt`/`lastSyncStatus` (ver sección 13).

### `POST /api/catalog/sync-collections` / `POST /api/catalog/sync-categories`

Disparan manualmente el refresco de `collection_reference`/
`category_reference` (ver sección 13.1). Responden `202` de inmediato, sin
esperar a que termine.

### Endpoints de analítica de producto (`/api/analytics/*`)

Los cuatro reciben solo `startDate`/`endDate` — ninguno recibe `storeId`:
todos retornan el desglose de TODAS las tiendas de una sola vez (global +
por tienda), para que el frontend no tenga que hacer una llamada HTTP por
cada una de las 6 tiendas en cada carga de página.

- **`GET /api/analytics/discounts`** → `{ global: DiscountDistribution, byStore: Record<storeId, DiscountDistribution>, multiBrand: {...} }`.
  Distribución de descuentos por bucket de 5 puntos (0%, 5%, 10%...), a
  nivel de UNIDAD, sobre todos los ítems del rango.
- **`GET /api/analytics/categories`** → `Record<storeId, { categories: CategoryRanking[] }>`.
  Ranking de categorías por tienda (cantidad y valor vendido), sobre
  todos los ítems del rango. Usado por `StoreCard` para "Categoría top".
- **`GET /api/analytics/category-contribution`** → `{ general: Record<categoría, CategoryBreakdown>, byStore: Record<storeId, Record<categoría, CategoryBreakdown>> }`.
  Aporte de cada categoría sobre el total de ventas **contabilizadas**
  (distinto del endpoint anterior: aquí solo cuentan las órdenes
  contabilizadas, para que la suma coincida con "valor contabilizado").
- **`GET /api/analytics/category-brands`** → `Record<storeId, CategoryBrandRankingResult>`.
  Para cada tienda, si es multimarca (`isMultiBrand`): la marca que más
  vendió DENTRO de cada categoría. Si no lo es:
  `{ applicable: false, reason: "..." }` explícito, nunca una lista vacía.

### `GET /api/analytics/summary?startDate&endDate` (`/resumen`)

Semáforo de ventas por tienda + motor del cambio + mensaje automático —
compara el rango elegido contra el período inmediatamente anterior de
igual duración. Ver sección **16.1** para la documentación completa
(definiciones, umbrales, aproximación de Pilatos, días provisionales).

### `POST /api/assistant/chat` (`/asistente`)

Chat del asistente conversacional de ventas — Server-Sent Events, body
`{ question: string, history: {role, content}[] }`. Ver sección **17**
para la documentación completa (herramientas, modos, límites conocidos).

## 8. Cómo funciona la paginación (dentro del cron)

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

- **Errores transitorios** (timeout, 429, 500, 502, 503, 504): pueden
  resolverse esperando y reintentando — por eso tienen todo el mecanismo
  de reintentos y rondas descrito arriba.
- **Errores permanentes** (400, 401, 403, 404, 422): VTEX está rechazando
  la petición de forma estructural — reintentarla, sin importar cuánto se
  espere, nunca va a funcionar.

Por eso, un error permanente se detecta y se deja de reintentar de
inmediato, y además dispara una **salvaguarda reactiva**: si ocurre un
HTTP 400 aunque el offset calculado no superara `VTEX_MAX_SAFE_OFFSET`, el
sistema parte el rango de fechas en dos mitades de todas formas y
reintenta — la evidencia real de un 400 es más confiable que cualquier
umbral configurado de antemano.

## 8.1. Rate limiting (HTTP 429)

Con rangos de fechas incluso cortos (2-3 días) es posible ver una falla
`HTTP 429` (rate limit) en los logs del cron. Esto NO depende del tamaño
del rango — depende de cuántas peticiones simultáneas le llegan a VTEX en
el momento en que corre el cron. Pilatos es la tienda más propensa a esto
porque, además de su consulta general, dispara consultas adicionales por
cada marketplace configurado (ver sección 10).

Un 429 significa "estás pidiendo más rápido de lo que permito", no "algo
se rompió". Por eso se trata aparte, con:

- **Backoff exponencial** (`VTEX_RATE_LIMIT_BACKOFF_MS`, default 2s, 4s,
  8s, 16s, 32s...) en vez del backoff corto de errores genéricos, o el
  valor de la cabecera `Retry-After` si VTEX la envía.
- **Su propio presupuesto de reintentos** (`VTEX_RATE_LIMIT_MAX_RETRIES`,
  default 5) — más generoso que `VTEX_MAX_RETRIES`.

### Límite de concurrencia GLOBAL

El control más importante: `VtexOrdersService` es un singleton, así que su
límite de concurrencia (`VTEX_GLOBAL_CONCURRENCY`, default 4) se comparte
entre **todas** las tiendas y **todos** los segmentos que el cron consulta
en una misma corrida. Si sigues viendo 429 con frecuencia, baja
`VTEX_GLOBAL_CONCURRENCY` (por ejemplo a 2 o 3).

## 9. Cómo se calculan los indicadores

- **`totalOrders`**: suma de `sales_daily.orders` del rango — cantidad de
  órdenes únicas de la tienda (o del segmento, en el caso de sellers/
  marketplaces), sin importar su status.
- **`statusCounts`**: `SUM(orders) GROUP BY status` sobre
  `sales_daily_by_status`. Se valida que `sum(statusCounts) === totalOrders`;
  si no coincide, `isConsistent` se marca en `false`.
- **`revenueOrders` / `revenueTotalValue`**: suma de `sales_daily_by_status`
  filtrando los status "contabilizados": `invoiced`, `payment-approved`,
  `handling` y `checking-invoice` — ver
  `backend/src/config/revenue-status.config.ts` para ajustar la lista.
- **`paymentMethods`**: agrupación por `paymentNames`. Si una orden reporta
  varios medios de pago separados por coma, se cuenta en cada uno de ellos
  (sin inflar `totalOrders`), y el porcentaje se calcula sobre el total de
  menciones de medios de pago, no sobre `totalOrders`.

## 10. Cómo agregar una nueva tienda

1. Agregar una entrada nueva en `backend/src/config/stores.config.ts` con su
   `id`, `accountName`, `environment`, `color` y (opcional) `collections`.
2. Agregar `<ID>_APP_KEY`, `<ID>_APP_TOKEN` y `<ID>_ENVIRONMENT` en
   `backend/.env` y `backend/.env.example`.
3. Reiniciar el backend (el cron recogerá la tienda nueva en su siguiente
   corrida, o al reiniciar).

No se requiere ningún otro cambio: el cron, la analítica, los endpoints y
el frontend leen la configuración de tiendas dinámicamente.

### Sellers y marketplaces (segmentación adicional)

Actualmente configurado solo para Pilatos, en
`backend/src/config/stores.config.ts` → `extraSegments`. El cron ejecuta,
además de la consulta general, una consulta de LISTADO independiente por
cada segmento configurado — mismo mecanismo para los dos tipos:

- Una por cada `seller` en `extraSegments.sellers`, agregando el
  parámetro `f_sellerNames=<sellerName>` al listado.
- Una por cada `marketplace` en `extraSegments.marketplaces`, agregando
  el parámetro `salesChannelId=<salesChannelId>`.

Las órdenes que devuelve cada consulta filtrada SON las de ese
seller/marketplace — no se inspecciona ningún campo del detalle de la
orden para clasificarlas.

Todas esas órdenes se combinan (deduplicadas por `orderId`) con las de la
consulta general para calcular el total real de la tienda, y además se
exponen por separado en `sales_daily_by_seller`/`sales_daily_by_marketplace`
(`segments` de la respuesta del dashboard), para las tablas "Comparativo de
sellers" y "Comparativo de marketplaces" del frontend.

## 11. Formato de moneda y normalización de `totalValue`

Los valores en pesos colombianos se formatean con
`Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })`
(ej. `$24.997.000`). El formateo ocurre únicamente en el frontend.

**Normalización.** En algunas cuentas VTEX el campo `totalValue` del listado
de órdenes viene expresado en una unidad menor que la moneda real (por
ejemplo, milésimas). Para corregirlo, el cron normaliza `totalValue` en un
único punto de entrada: `VtexOrdersService.normalizeMoney()`
(`backend/src/common/utils/money-normalizer.util.ts`), antes de guardar
cualquier agregado en Supabase.

El factor de corrección se controla con `VTEX_MONEY_DIVISOR` en `.env`:

| Valor | Cuándo usarlo |
|---|---|
| `1000` (default) | Las cifras de ventas aparecen ~1000 veces más grandes de lo real (caso más común reportado) |
| `100` | La cuenta VTEX entrega los valores en centavos (convención estándar documentada por VTEX) |
| `1` | Los valores ya vienen correctos, sin conversión |

**Importante:** el histórico importado desde Excel (sección 13.2) YA viene
en pesos reales — el importador NUNCA aplica `VTEX_MONEY_DIVISOR` sobre
esos valores.

## 12. Zona horaria

Colombia usa UTC-5 sin horario de verano. Todo el sistema — el cron, el
dashboard y el importador de Excel — agrupa las órdenes por "día calendario
de Colombia" (no UTC) de forma consistente, usando
`backend/src/common/utils/date-range.util.ts` como único punto de verdad
para esa conversión. Si esto no fuera consistente entre las tres fuentes,
un mismo día podría aparecer con datos distintos según de dónde vino cada
agregado.

## 13. Arquitectura de datos: cron + agregados en Supabase

El backend YA NO guarda órdenes crudas ni consulta VTEX en el momento en
que alguien abre el dashboard. En su lugar:

- **`VtexSyncCronService`** (`backend/src/modules/sync/services/vtex-sync-cron.service.ts`)
  es la ÚNICA pieza del sistema que le habla a VTEX en vivo. Corre cada
  `SYNC_CRON_INTERVAL_HOURS` horas (+ una corrida al arrancar el backend).
  En cada corrida, por cada tienda: trae el listado de VTEX (general +
  una consulta filtrada por cada seller/marketplace configurado, ver
  sección 10) para la ventana `[hoy - SYNC_RECALC_WINDOW_DAYS, ahora]`, el
  detalle de cada orden de esa ventana (ciudad, ítems, campañas de
  descuento), y **recalcula por completo** los agregados diarios de esos
  días
  específicos — los días fuera de esa ventana nunca se vuelven a tocar,
  quedan fijos como histórico definitivo.
- **`common/aggregation/daily-aggregator.ts`** contiene las reglas de
  negocio de agregación (clasificación de revenue, split de método de
  pago, buckets de descuento) como funciones puras, sin dependencias de
  VTEX ni de Postgres — las usa TANTO el cron como el importador de Excel
  (sección 13.2), para no duplicar esas reglas entre las dos fuentes.
- **Supabase (PostgreSQL)** guarda el resultado en un puñado de tablas
  `sales_daily*` (una fila por día+tienda+dimensión — status, medio de
  pago, ciudad, categoría, marca, colección, campaña de descuento, bucket
  de descuento, seller, marketplace), más tablas de referencia chicas
  (`category_reference`, `brand_reference`, `collection_reference`) y
  `sync_logs` (trazabilidad de cada corrida). Ver el esquema completo en
  `backend/src/modules/database/migrations/0001_init.sql`.
- **El dashboard** (`OrdersService`/`ProductAnalyticsService`) solo hace
  `SUM`/`GROUP BY` sobre esas tablas — nunca VTEX, nunca un caché en
  memoria o en disco.

### Conexión a Supabase

Usa el connection string del **pooler de Supabase, modo Transaction
(puerto 6543)** — nunca el de conexión directa (puerto 5432), por la
cantidad de usuarios concurrentes esperados. Se obtiene desde el panel de
Supabase: *Project Settings → Database → Connection string → pestaña
"Direct" → seleccionar "Transaction pooler"*. Se configura en
`DATABASE_URL` (`backend/.env`).

### Crear/actualizar el esquema

```bash
cd backend
npm run db:migrate
```

Corre `migrations/0001_init.sql` completo dentro de una sola transacción.
El script usa `DROP TABLE IF EXISTS ... CASCADE` antes de cada
`CREATE TABLE`, así que es seguro volver a correrlo mientras se itera el
esquema — pero también significa que **borra y recrea todas las tablas**
cada vez que se ejecuta: no lo corras contra una base con datos que
quieras conservar sin antes respaldarlos.

### Catálogo: categorías y colecciones

- `category_reference` (id → nombre) se refresca al arrancar el backend
  y con `POST /api/catalog/sync-categories` — solo se usa para traducir
  el histórico de Excel (el detalle de orden de la API ya trae el nombre
  de categoría directamente).
- `collection_reference` (SKU → colección: Línea/Rack/Outlet/Saldos) se
  refresca al arrancar, todos los días a las 3am, y con
  `POST /api/catalog/sync-collections`. Los IDs de colección por tienda
  están en `backend/src/config/stores.config.ts` (`collections`) — agregar
  un estado nuevo a futuro es solo editar esa lista.
- `brand_reference` (SKU → marca) se puebla PASIVAMENTE: cada vez que el
  cron o el importador de Excel procesan el detalle de una orden con
  `brandName`, se guarda ahí — solo importa para Pilatos (única tienda
  `isMultiBrand`).

## 13.1. Segmentación de Pilatos (sellers/marketplaces) — detalle de tablas

`sales_daily_by_seller`/`sales_daily_by_marketplace` clasifican a nivel de
ORDEN completa (no de ítem). Las órdenes de un segmento YA están incluidas
en el total de su tienda en `sales_daily` — estas tablas son solo para el
desglose comparativo, no se deben volver a sumar al resumen global.

## 13.2. Importación histórica desde Excel

Script CLI **separado del backend desplegado** — corre manualmente desde
tu máquina, nunca se sube a git junto con los archivos Excel reales (que
contienen información personal de clientes; `.env.local` con
`DATABASE_URL` tampoco se sube, ver `.gitignore`).

```bash
cd backend
cp .env.local.example .env.local   # completar con tu DATABASE_URL
npm run import:historico -- --path="C:/ruta/a/order vtex"
```

Reconoce archivos con el patrón `"ordenes {tienda} {mes_inicio} - {mes_fin} {año}"`
(ej. `"ordenes diesel enero - junio 2026"`), lee cada uno con un lector
**streaming** (no carga el Excel completo en memoria), y por cada fila:

1. Descarta de inmediato toda columna con datos personales/de pago (ver
   `backend/src/cli/excel-import/row-picker.ts` — es una ALLOWLIST
   explícita: solo sobreviven las columnas necesarias, cualquier otra
   columna —incluida una que se agregue al Excel en el futuro— se
   descarta automáticamente).
2. Valida que la columna `Host` corresponda al `accountName` esperado
   para esa tienda — si no coincide, aborta ESE archivo (nunca mezcla
   datos de cuentas distintas).
3. Agrupa las filas por `Order` (una orden con varios productos genera
   varias filas, distintas solo en las columnas de SKU) y resuelve
   categoría/colección/marca contra las tablas de referencia (sección 13).
4. Alimenta el MISMO `daily-aggregator.ts` que usa el cron, y hace
   upsert en las mismas tablas `sales_daily*` — el destino no distingue
   si el dato vino de Excel o de la API.
5. Registra el resultado en `sync_logs` con `source = 'excel_import'`.

El `order_id` del Excel (incluidos prefijos como `VPC-`) se guarda tal
cual, sin ninguna transformación — así coincide con el mismo id que
eventualmente traiga la API para esa orden.

## 14. Scripts

```bash
# Backend
cd backend
npm install
npm run start:dev         # desarrollo
npm run build && npm run start:prod   # producción
npm run db:migrate        # crea/recrea el esquema en Supabase
npm run import:historico -- --path="..."   # importación histórica de Excel
npm run ga:backfill -- --from=... --to=...   # backfill histórico de Google Analytics 4 (sección 16)
npm test                  # tests de verificación (agregación, columnas sensibles, order_id)

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

El backend ya NO necesita un volumen de disco persistente (no hay caché
SQLite local) — todo el estado vive en Supabase. Solo asegúrate de que
`DATABASE_URL` esté configurada en el entorno del contenedor/plataforma de
despliegue (ej. variables de entorno de Render).

## 16. Módulo GA4 (fase 1) — comportamiento/tráfico de Google Analytics

Agrega, en paralelo a VTEX y sin tocar nada de lo existente, tráfico y
embudo de e-commerce desde la **Google Analytics Data API (GA4)**. Mismo
principio que VTEX: un cron sincroniza a Supabase, el dashboard SOLO lee
de ahí — nunca habla con Google en el momento en que alguien abre
`/analytics`.

**Entregado en 2 fases**: la Fase A trae sincronización + lectura cruda de
GA4 (`/analytics`) — sesiones, embudo, canales, dispositivos, landing
pages, ciudades, nuevos/recurrentes, productos. La Fase B (cruce con
ventas reales — `/resumen`, ver sección 16.1) se construyó DESPUÉS de
validar que los números de la Fase A ya cuadraban contra la consola de
GA4 directamente, para no mezclar "¿el dato de GA está bien?" con "¿la
fórmula del cruce está bien?" en la misma verificación.

### Variables de entorno

```bash
# JSON de la cuenta de servicio de Google (Google Analytics Data API),
# crudo o en base64 — se detecta solo cuál es. NUNCA se loguea ni se
# escribe a disco (ver backend/src/common/utils/ga-credentials.util.ts).
GA_SERVICE_ACCOUNT_JSON=

# ID NUMÉRICO de la propiedad GA4 de cada tienda (Admin > Property
# Settings > Property ID) — NO el ID de medición "G-XXXXXXX" del tag.
# Si una tienda no tiene ID, el cron de GA4 la omite (no es un error).
GA_PROPERTY_ID_PILATOS=
GA_PROPERTY_ID_KIPLING=
GA_PROPERTY_ID_DIESEL=
GA_PROPERTY_ID_SUPERDRY=
GA_PROPERTY_ID_GIRBAUD=
GA_PROPERTY_ID_REPLAY=

GA_SYNC_CRON_HOURS=12          # cada cuántas horas se sincroniza GA4
GA_RECALC_WINDOW_DAYS=3        # días hacia atrás que recalcula cada corrida
GA_SYNC_ON_BOOT=false          # si corre GA4 al arrancar el backend
GA_CHANGE_ENGINE_THRESHOLD_PERCENT=5   # umbral del "motor del cambio" (Fase B)
```

El JSON de la cuenta de servicio NUNCA se sube a git — `.gitignore` (raíz
y `backend/`) además bloquea cualquier archivo `*service-account*.json`/
`*credentials*.json`/`ga4-*.json` que pudiera quedar en el proyecto por
error.

### Por qué GA4 nunca corre al mismo tiempo que VTEX

El backend corre en un dyno con memoria limitada (Render gratuito,
~256MB) que ya tuvo un `heap out of memory` real. En vez de dos crons
independientes compitiendo por memoria, hay UNO solo que manda:
`VtexSyncCronService` sigue funcionando exactamente igual que siempre
(cada `SYNC_CRON_INTERVAL_HOURS`), y al TERMINAR su propia corrida —
nunca antes— dispara GA4 si ya pasaron `GA_SYNC_CRON_HOURS` desde la
última vez (`GaSyncCronService.maybeSync()`). Como literalmente corren
uno después del otro en la misma cadena de `await`, es imposible que se
crucen — no hace falta ningún candado.

### Esquema

Migración `backend/src/modules/database/migrations/0012_add_ga4.sql` —
3 tablas nuevas (`ga_daily`, `ga_daily_by_channel`, `ga_daily_by_device`),
mismo molde que `sales_daily_by_city` (`date`/`year`/`month` + `store_id`
+ dimensión + métricas). **Aditiva** (`CREATE TABLE IF NOT EXISTS`, nunca
`DROP TABLE`) — a diferencia de `0001_init.sql`, por lo que se aplicó con
un script de una sola vez (`Client` de `pg` directo contra
`DATABASE_URL`), **nunca con `npm run db:migrate`**: ese script re-corre
TODO el historial de migraciones desde `0001_init.sql`, que sí tiene
`DROP TABLE ... CASCADE` — correrlo contra una base con datos reales
destruiría todo lo existente.

### Cómo verificar GA4 manualmente (hacerlo ANTES del backfill completo)

**Zona horaria de cada propiedad** (repetir para las 6, cambiando de
propiedad arriba a la izquierda en analytics.google.com): Admin (el
engranaje) → columna "Property" → "Property details"/"Property
settings" → campo "Reporting Time Zone". Debe decir "(GMT-05:00) Bogotá"
(o el mismo huso horario) — si dice otra cosa, los días de GA quedan
desfasados contra `sales_daily` sin que se note a simple vista.

**Que la propiedad tenga datos de e-commerce**: Reports → Life cycle →
Monetization → "Ecommerce purchases", mismo rango de fechas que se vaya a
sincronizar. Si todo sale en cero, el problema no es el código de este
módulo — es que el sitio no le está mandando eventos de e-commerce a GA4
(falta configuración de Google Tag Manager/dataLayer). Para comparar un
número puntual: Reports → Acquisition → "Traffic acquisition", fijar un
solo día y anotar "Sessions" — debe coincidir (±1-2%) con `sessions` de
`ga_daily` para esa tienda/fecha una vez corrido el backfill.

### Backfill inicial

```bash
cd backend
npm run ga:backfill -- --from=2026-01-01 --to=2026-10-01
npm run ga:backfill -- --from=2026-01-01 --to=2026-10-01 --store=pilatos
```

Igual que `npm run backfill` (VTEX): proceso aparte, trocea el rango en
bloques de ~1 mes, tienda por tienda en secuencia. Al final imprime, por
tienda, qué % de los días del rango tuvo `sessions > 0` — así se sabe
cuánto histórico entrega realmente cada propiedad sin asumir un límite de
antemano (una propiedad GA4 puede simplemente no tener datos tan atrás).

### Supuestos de negocio (cruce con ventas, Fase B)

- **Sellers de Pilatos** (Armo Studio, Disandina, Tennis SA, Clemont):
  **NO se excluyen** del cálculo de conversión del sitio — confirmado que
  sí venden a través de la página web de Pilatos.
- **Marketplaces de Pilatos** (Agaval, Addi, Dafiti, Fruta fresca, Puntos
  Colombia, Replaycolombia, Falabella): **SÍ se excluyen** — no pasan por
  el sitio web, así que sus órdenes se restan del total contabilizado
  antes de calcular sesiones ÷ órdenes (si no, la conversión del sitio
  saldría inflada). Controlado por `excludeFromSiteConversion` en
  `backend/src/config/stores.config.ts` — si se confirma que algún canal
  sí vende por el sitio, basta con poner su flag en `false`.
- Para las otras 5 tiendas no existe esta segmentación: si alguna
  empezara a vender por fuera de su sitio web, su conversión calculada
  saldría inflada sin que el sistema pueda detectarlo.

### Tamaño de las tablas

```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables ORDER BY 2 DESC;
```

## 16.1. `/resumen` (Fase B) — semáforo de ventas + motor del cambio

Endpoint: `GET /api/analytics/summary?startDate&endDate`. Igual principio
que todo lo demás: SOLO lee `sales_daily*`/`ga_daily*` de Supabase, nunca
consulta VTEX ni Google en el momento en que alguien abre `/resumen`.
Módulo propio (`backend/src/modules/resumen/`), desacoplado de
`OrdersModule`/`AnalyticsGaModule` — mismo criterio que `AnalyticsGaModule`
en su momento.

### Definiciones

- **Período A** (actual): el rango elegido. **Período B** (anterior): el
  rango INMEDIATAMENTE anterior, de IGUAL duración, sin solaparse
  (`previousPeriodOfEqualDuration` en `date-range.util.ts`). **Período C**
  (año anterior, informativo): mismo rango un año calendario atrás
  (`sameRangeLastYear`) — nunca afecta el semáforo ni el motor.
- **Ventas**: valor de órdenes CONTABILIZADAS (`sales_daily_by_status`
  filtrado con `matchRevenueStatusDefinition`, igual lista de estados que
  el resto del dashboard) — NUNCA `sales_daily.sales` (esa es venta sin
  filtrar por estado).
- **Compras reales**: EXACTAMENTE el mismo campo que la card "Compras
  reales" del Dashboard (`sales_daily.real_revenue_orders` — compras
  deduplicadas por número base de orden, donde algún fragmento llegó a un
  estado contabilizado).
- **Conversión** = compras reales ÷ sesiones (`ga_daily.sessions`).
  **Ticket** = ventas ÷ compras reales. Toda división está protegida
  (`safe-math.util.ts`) — si falta cualquiera de los dos lados, el
  resultado es `null` ("sin datos"), NUNCA se inventa un -100%.

### Semáforo (Parte 2 del encargo original)

El color depende SOLO de la variación de ventas de A contra B. Constantes
en `backend/src/config/resumen-semaphore.config.ts` (valores iniciales, a
validar con datos reales):

```ts
floorRedPercent: 5      // piso de la zona roja
floorGreenPercent: 10   // piso de la zona verde
k: 1.5                  // multiplicador de la variación habitual (σ)
minPurchases: 100       // compras reales mínimas en A y B para opinar
minHistoryChanges: 6    // cambios mínimos para usar el historial propio
maxHistoryWindows: 13   // tope de ventanas históricas hacia atrás
```

Umbral POR TIENDA: se construyen hasta 13 ventanas consecutivas, de la
MISMA duración que el rango elegido, EMPEZANDO por B y yendo hacia atrás
(`buildHistoryWindowRanges` — el período A nunca entra en el cálculo de
su propio umbral, ni siquiera se le pasan sus fechas a la función). Se
excluyen las ventanas sin ventas, se calculan los % de cambio entre las
que sobreviven, y la "variación habitual" (σ) se calcula con una
desviación robusta (MAD × 1,4826 — no desviación estándar clásica, para
que un pico puntual tipo Black Friday no distorsione el umbral de una
tienda). Con 6 o más cambios: `redLimit = -max(floorRedPercent, k×σ)`,
`greenLimit = max(floorGreenPercent, k×σ)`. Con menos: se usan
`floorRedPercent`/`floorGreenPercent` tal cual ("valores por defecto").

**Gris** (sin opinión, siempre con motivo) cuando: A o B no tienen datos
de ventas, B tuvo ventas en cero, o las compras reales de A o de B están
por debajo de `minPurchases`.

### Motor del cambio y frenos (Parte 3)

Identidad `ventas = sesiones × conversión × ticket` ⟹
`ln(V_A/V_B) = ln(S_A/S_B) + ln(C_A/C_B) + ln(T_A/T_B)`
(`change-engine.util.ts`). Cada término se expresa ×100 ("aporte en
puntos") — los 3 suman EXACTO el cambio total en escala logarítmica. El
**motor** es la pieza alineada con la dirección del cambio total de mayor
aporte absoluto, solo si supera `GA_CHANGE_ENGINE_THRESHOLD_PERCENT` (5%,
`configuration.ts` → `app.ga.changeEngineThresholdPercent`). El **freno**
es una pieza que va en contra de esa dirección y también supera el
umbral — NO cambia el color, solo se marca. Si el cambio total de ventas
es menor a 1%, no se nombra motor. El motor/los frenos solo se calculan
si la cobertura de GA es 100% en A y B (si falta, se muestra la razón).

### Mezcla de canales vs. deterioro dentro de los canales (Parte 4)

Solo cuando la conversión según Analytics cambia ≥5% y hay 100% de
cobertura GA en A y B: descomposición tipo Oaxaca-Blinder sobre
`ga_daily_by_channel` (`channel-mix.util.ts`) — `efecto_mezcla` (cambió
de dónde viene el tráfico) vs. `efecto_dentro` (cada canal convierte
distinto). Canales con menos de 20 compras GA en A **o** en B se agrupan
en "Otros", mismo agrupamiento en los dos períodos. Etiquetado "según
Analytics, indicativo" — Analytics registra solo una parte de las
compras reales.

### Pilatos — ajuste por marketplaces externos

El semáforo usa las ventas TOTALES de Pilatos (todas las fuentes,
incluyendo marketplaces). La conversión, el ticket y el motor usan la
base DEL SITIO: ventas del sitio = ventas totales − `revenue_sales` de
`sales_daily_by_marketplace` de los canales con `excludeFromSiteConversion`;
compras del sitio = compras reales − `revenue_orders` de esos mismos
canales. **Aproximación documentada**: `revenue_orders` de
`sales_daily_by_marketplace` son ÓRDENES (sin deduplicar fragmentos
`-01`/`-02`), no "compras reales" — no existe ese dedup a nivel de
marketplace, así que "compras del sitio" de Pilatos es una aproximación,
no un número exacto. La tarjeta muestra ambas líneas (total y del sitio)
y lista los marketplaces excluidos.

### Efecto de los días provisionales

Mismo criterio que `/analytics` (`GaQueryService.getOverview`,
reimplementado como función pura en `ga-coverage.util.ts` para no
depender de `AnalyticsGaModule`): los últimos 2 días calendario (hoy y
ayer) que ya tengan fila en `ga_daily` cuentan como "provisionales" Y
como "cubiertos" en la cobertura al mismo tiempo — nunca se pintan de
gris ni se suprime ningún cálculo por esto, solo se agrega la etiqueta
`provisional` y la lista de fechas. Si el período actual incluye un día
provisional y el anterior no, la variación puede salir un poco más baja
de lo que será una vez ese día termine de estabilizarse (GA4 tarda
24-48h).

### Cómo leer el panel "¿Cómo se calculó este color?"

Cada tarjeta de `/resumen` trae un panel desplegable con los números
EXACTOS usados para decidir el color: fechas de A y B, variación de
ventas, los límites rojo/verde aplicados y su fuente ("historial propio"
con σ y número de ventanas, o "valores por defecto"), compras reales de
A y B contra `minPurchases`, cobertura de GA de A y B, la lectura de
mezcla si aplica, los marketplaces excluidos (solo Pilatos), y las fechas
provisionales si las hay — toda tarjeta es auditable sin tener que
confiar a ciegas en el color.

### Fuera de alcance (confirmado)

Alertas de ciudad o producto dentro de `/resumen`, una página `/comparar`
aparte, cruce con presupuesto vs. real, y un puntaje combinado de "salud"
de tienda — el ranking se ordena solo por variación de ventas, mostrando
sesiones/conversión/ticket al lado, nunca un solo número compuesto.

## 17. Asistente conversacional de ventas (`/asistente`) — Fase 1

Endpoint: `POST /api/assistant/chat` (Server-Sent Events). Módulo propio
(`backend/src/modules/assistant/`), desacoplado — mismo criterio que
`ResumenModule`/`AnalyticsGaModule`. El modelo NUNCA calcula una cifra por
su cuenta: cada número que menciona viene literalmente del resultado de
una herramienta determinista de TypeScript, que a su vez solo lee
`sales_daily*`/`credit_notes`/`budgets_daily` ya sincronizados — nunca
llama a VTEX/Google/el ERP en vivo.

### Las 6 herramientas (Fase 1)

- **`resolve_period`** — convierte una frase en español ("ayer", "esta
  semana", "mes pasado", etc., o un rango explícito
  `YYYY-MM-DD..YYYY-MM-DD`) en `{startDay, endDay}`
  (`common/utils/period-resolver.util.ts`, puro, sin DB). Vocabulario fijo
  — una frase no reconocida devuelve un error claro en vez de inventar una
  fecha.
- **`get_sales`** — ventas de una tienda/rango por uno de 9 cortes:
  status, payment, city, category, brand, collection, discount_bucket,
  seller, marketplace. Reutiliza las MISMAS tablas `sales_daily_by_*` que
  el resto del dashboard. Límites conocidos:
  - `seller`/`marketplace` solo existen para Pilatos.
  - `brand` no es un corte plano en la base — se arma sumando
    `sales_daily_by_category_brand` por `brand_name` (ignorando
    categoría); esta tabla NO distingue por estado de la orden, así que
    puede incluir canceladas (la herramienta avisa esto en `warnings`).
  - `category`/`collection`/`discount_bucket` traen unidades, no conteo
    de órdenes (`orders: null` en esas filas).
- **`compare_periods`** — compara el total de ventas de una tienda entre
  dos rangos y devuelve el `%` de cambio YA CALCULADO
  (`percent-change.util.ts`) — nunca le pide al modelo restar/dividir.
- **`get_budget_vs_actual`** — cruza `BudgetsService.getRangeSummary`
  (presupuesto) con la venta real contabilizada del mismo rango/tienda —
  no existía un endpoint que hiciera este cruce para una sola tienda
  (`/presupuesto` lo hace client-side con dos llamadas). Para Pilatos, el
  presupuesto se compara contra la venta TOTAL (incluye sellers/
  marketplaces, sin ajustar — confirmado explícitamente). Si el rango
  cruza más de un mes calendario, `fullMonthAvailable: false` — la
  herramienta nunca inventa un "mes completo" cuando no aplica.
- **`get_credit_notes`** — reusa `CreditNotesQueryService.getSummary` tal
  cual + `meta.lastSyncedAt` (`MAX(synced_at)` de `credit_notes`, el único
  indicador posible: notas crédito no tiene fila en `sync_logs`, se
  sincroniza a mano desde una máquina con VPN). Si el rango pedido llega
  más allá de `lastSyncedAt`, avisa en `warnings` en vez de reportar 0
  notas crédito como si de verdad no hubiera habido ninguna.
- **`get_sync_status`** — última sincronización de VTEX/GA4 (por tienda,
  `sync_logs`) + de notas crédito (global). El presupuesto no aparece acá
  — es 100% manual, sin concepto de sincronización.

### Modos de conversación (ver `prompts/system-manual.md`)

**Modo A** (dato puntual): resuelve el período, llama la herramienta que
corresponda, responde directo. **Modo B** (análisis con niveles de
certeza): usa `compare_periods`, gradúa su certeza según el tamaño del
cambio — en esta fase SIN la atribución tráfico/conversión/ticket de
`/resumen` (llega en una fase futura, ver abajo). **Modo C** (evaluación
contra presupuesto): como todavía no hay catálogo de temporadas, pide una
FECHA/rango (no un nombre de temporada), evalúa con
`get_budget_vs_actual`, y SOLO DESPUÉS pregunta si el usuario quiere
comparar contra otro período (año anterior/semana anterior/mes
anterior/uno a su elección) — nunca trae esa comparación sin que el
usuario la pida.

### Proveedor de LLM — intercambiable (Anthropic ↔ OpenAI)

Las 6 herramientas, su validación (`class-validator`, sin `zod`) y el
prompt son 100% independientes del proveedor. Lo único que cambia entre
Anthropic y OpenAI es qué modelo narra la conversación — mismo
comportamiento, misma calidad de respuesta esperada, solo distinto costo/
disponibilidad.

- **`ASSISTANT_PROVIDER`** = `"openai"` (default, activo hoy) |
  `"anthropic"` (completamente construido, listo para cuando haya una
  clave de pago de Anthropic — cambiar esta única variable alcanza, no
  hay que tocar ningún otro archivo).
- Arquitectura: `providers/assistant-llm-provider.interface.ts` define la
  forma neutral de una herramienta (`AssistantToolDefinition`:
  `name`/`description`/`parameters` JSON Schema, definida UNA sola vez en
  `assistant-tools.registry.ts`) y la interfaz `AssistantLlmProvider`
  (`streamConversation(...)`, corre la conversación completa incluido su
  propio loop de tool use). `providers/anthropic-assistant.provider.ts` y
  `providers/openai-assistant.provider.ts` implementan cada una su propio
  loop (formas de "tool call" distintas en cada API) traduciendo la
  herramienta neutral a su propio formato de cable. `AssistantChatService`
  no conoce de qué proveedor viene el modelo — solo arma el prompt +
  herramientas, delega, y registra en `assistant_logs`.
- **Proveedor OpenAI** (`OPENAI_API_KEY`, `OPENAI_MODEL`, default
  `gpt-5.4-mini` — mini de la generación actual, barato y sólido en tool
  calling): usa la **Responses API** (`client.responses.stream`), no Chat
  Completions — es la que OpenAI recomienda hoy para agentes nuevos con
  tool calling, confirmado contra la documentación oficial y los tipos
  del SDK instalado (`openai@7.x`) en vez de memoria. Formato de
  herramienta: `{type:'function', name, description, parameters}`; una
  llamada del modelo llega como ítem `function_call` (`arguments` como
  string JSON) en `response.output`; la respuesta se envía de vuelta
  agregando ese mismo `output` al `input` más un ítem
  `function_call_output` por cada `call_id`.
- **Proveedor Anthropic** (`ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`,
  default `claude-opus-5-5`; `ASSISTANT_EFFORT`, default `medium` —
  sin equivalente en el proveedor OpenAI): loop manual sobre
  `client.messages.stream`, formato de herramienta
  `{name, description, input_schema}`, caché de prompt (`cache_control`)
  en el bloque de sistema y en el arreglo de herramientas.
- Sin la clave del proveedor elegido, `/asistente` responde con un
  mensaje claro indicando qué variable falta — el resto del dashboard
  sigue funcionando normal.

### Límites y auditoría

Rate limit (`AssistantRateLimitGuard`, mismo patrón que `BudgetCodeGuard`):
`ASSISTANT_RATE_LIMIT_PER_MINUTE` (default 6, por IP) y
`ASSISTANT_RATE_LIMIT_PER_DAY` (default 200, global — tope de gasto de
API, sin importar el proveedor). Cada pregunta respondida (o fallida) se
registra en `assistant_logs` (migración 0022): pregunta, herramientas
usadas, respuesta, modelo, tokens, latencia, error si lo hubo — sin
`user_id` (esta app no tiene autenticación por usuario). Limpieza
automática a 90 días: pendiente, fuera de esta fase.

### Fuera de alcance (Fase 2)

`search_campaign` (campañas de descuento VTEX + campañas UTM de Analytics
combinadas por coincidencia de texto), `get_diagnosis` (reutilizar el
motor del cambio de `/resumen`, con un segundo período de comparación),
`get_analytics` (cortes de GA4), y la limpieza automática de
`assistant_logs`.
