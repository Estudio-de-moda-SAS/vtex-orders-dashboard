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
