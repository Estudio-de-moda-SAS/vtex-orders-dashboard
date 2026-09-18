-- Esquema inicial de Supabase para el modelo de agregados pre-calculados.
-- Re-ejecutable a propósito (DROP TABLE IF EXISTS ... CASCADE antes de
-- cada CREATE TABLE) mientras se itera el esquema en desarrollo. Todo el
-- archivo corre como UNA sola transacción (ver scripts/run-migrations.ts):
-- si algo falla a mitad de camino, Postgres revierte todo, nunca queda el
-- esquema a medias.
--
-- Nota sobre las columnas `revenue_*`: además de las columnas "totales"
-- (orders/units + sales, que cuentan TODAS las órdenes sin importar su
-- status), varias tablas de desglose llevan un segundo par que cuenta
-- SOLO las órdenes cuyo status está en la lista "contabilizada" (invoiced,
-- payment-approved, handling, checking-invoice — ver
-- backend/src/config/revenue-status.config.ts). Esto preserva la
-- distinción que ya existía en el dashboard anterior entre "toda la
-- actividad" y "venta contabilizada real" para cada dimensión. La tabla
-- base `sales_daily` NO lleva estas columnas: el total contabilizado a
-- nivel de tienda se deriva sumando `sales_daily_by_status` filtrando los
-- status contabilizados (esa tabla ya tiene la granularidad necesaria).

BEGIN;

DROP TABLE IF EXISTS sales_daily_by_category_brand CASCADE;
DROP TABLE IF EXISTS sales_daily_by_brand_discount_bucket CASCADE;
DROP TABLE IF EXISTS sales_daily_by_marketplace CASCADE;
DROP TABLE IF EXISTS sales_daily_by_seller CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS collection_reference CASCADE;
DROP TABLE IF EXISTS brand_reference CASCADE;
DROP TABLE IF EXISTS category_reference CASCADE;
DROP TABLE IF EXISTS sales_daily_by_discount_bucket CASCADE;
DROP TABLE IF EXISTS sales_daily_by_discount_campaign CASCADE;
DROP TABLE IF EXISTS sales_daily_by_collection CASCADE;
DROP TABLE IF EXISTS sales_daily_by_brand CASCADE;
DROP TABLE IF EXISTS sales_daily_by_category CASCADE;
DROP TABLE IF EXISTS sales_daily_by_city CASCADE;
DROP TABLE IF EXISTS sales_daily_by_payment CASCADE;
DROP TABLE IF EXISTS sales_daily_by_status CASCADE;
DROP TABLE IF EXISTS sales_daily CASCADE;
DROP TABLE IF EXISTS stores CASCADE;

-- Tienda
CREATE TABLE stores (
  store_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vtex_account TEXT NOT NULL,
  is_multi_brand BOOLEAN NOT NULL DEFAULT false
);

-- Agregado diario base: total de órdenes/unidades/ventas/descuentos de la
-- tienda, sin importar status. El total "contabilizado" se deriva de
-- sales_daily_by_status (ver nota arriba).
CREATE TABLE sales_daily (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  orders INT NOT NULL DEFAULT 0,
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  discounts NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id)
);
CREATE INDEX idx_sales_daily_store_date ON sales_daily (store_id, date);

CREATE TABLE sales_daily_by_status (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  status TEXT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, status)
);
CREATE INDEX idx_sdbs_store_date ON sales_daily_by_status (store_id, date);

CREATE TABLE sales_daily_by_payment (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  payment_method TEXT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_orders INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, payment_method)
);
CREATE INDEX idx_sdbp_store_date ON sales_daily_by_payment (store_id, date);

CREATE TABLE sales_daily_by_city (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  city TEXT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_orders INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, city)
);
CREATE INDEX idx_sdbc_store_date ON sales_daily_by_city (store_id, date);

CREATE TABLE sales_daily_by_category (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  category_name TEXT NOT NULL,
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_units INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, category_name)
);
CREATE INDEX idx_sdbcat_store_date ON sales_daily_by_category (store_id, date);

CREATE TABLE sales_daily_by_brand (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  brand_name TEXT NOT NULL,
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_units INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, brand_name)
);
-- Solo se puebla para tiendas con is_multi_brand = true (Pilatos)
CREATE INDEX idx_sdbb_store_date ON sales_daily_by_brand (store_id, date);

CREATE TABLE sales_daily_by_collection (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  collection_name TEXT NOT NULL, -- 'Línea' | 'Rack' | 'Outlet' | 'Saldos' | 'Sin colección'
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_units INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, collection_name)
);
CREATE INDEX idx_sdbcol_store_date ON sales_daily_by_collection (store_id, date);

CREATE TABLE sales_daily_by_discount_campaign (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  campaign_name TEXT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, campaign_name)
);
CREATE INDEX idx_sdbdc_store_date ON sales_daily_by_discount_campaign (store_id, date);

CREATE TABLE sales_daily_by_discount_bucket (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  discount_percentage INT NOT NULL, -- 0, 5, 10, 15... bucket redondeado
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, discount_percentage)
);
CREATE INDEX idx_sdbdb_store_date ON sales_daily_by_discount_bucket (store_id, date);

-- Cruce categoría×marca (solo tiendas multimarca, hoy Pilatos) —
-- necesaria para "la marca que más vendió DENTRO de cada categoría"
-- (`ProductAnalyticsService.getTopBrandByCategory`), que
-- `sales_daily_by_category` (sin marca) y `sales_daily_by_brand` (sin
-- categoría) no pueden reconstruir por separado.
CREATE TABLE sales_daily_by_category_brand (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  category_name TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, category_name, brand_name)
);
CREATE INDEX idx_sdbcb_store_date ON sales_daily_by_category_brand (store_id, date);

-- Distribución de descuento POR MARCA (solo tiendas multimarca, hoy
-- Pilatos) — necesaria para "el descuento más aplicado dentro de cada
-- marca" (`ProductAnalyticsService.getMultiBrandDiscountBreakdown`), que
-- `sales_daily_by_discount_bucket` (sin marca) y `sales_daily_by_brand`
-- (sin descuento) no pueden reconstruir por separado.
CREATE TABLE sales_daily_by_brand_discount_bucket (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  brand_name TEXT NOT NULL,
  discount_percentage INT NOT NULL,
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, brand_name, discount_percentage)
);
CREATE INDEX idx_sdbdbb_store_date ON sales_daily_by_brand_discount_bucket (store_id, date);

-- Segmentos de Pilatos (sellers/marketplaces) — mismo patrón que
-- sales_daily_by_payment. Clasificación a nivel de ORDEN completa. Las
-- órdenes de un segmento YA están incluidas en el total de su tienda en
-- `sales_daily`; estas tablas son solo para el desglose comparativo por
-- vendedor/marketplace (`SegmentComparisonTable` en el frontend).
CREATE TABLE sales_daily_by_seller (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  seller_name TEXT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_orders INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, seller_name)
);
CREATE INDEX idx_sdbse_store_date ON sales_daily_by_seller (store_id, date);

CREATE TABLE sales_daily_by_marketplace (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  marketplace_name TEXT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_orders INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, marketplace_name)
);
CREATE INDEX idx_sdbma_store_date ON sales_daily_by_marketplace (store_id, date);

-- Tablas de referencia (chicas, casi estáticas)

CREATE TABLE category_reference (
  category_id INT PRIMARY KEY,
  category_name TEXT NOT NULL
);

CREATE TABLE brand_reference (
  sku_id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL
);

CREATE TABLE collection_reference (
  sku_id TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  collection_name TEXT NOT NULL,
  PRIMARY KEY (sku_id, store_id)
);

-- Trazabilidad operativa

CREATE TABLE sync_logs (
  id SERIAL PRIMARY KEY,
  store_id TEXT REFERENCES stores(store_id),
  source TEXT NOT NULL, -- 'vtex_api' | 'excel_import'
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL, -- 'success' | 'error' | 'partial'
  records_read INT DEFAULT 0,
  records_inserted INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  error_message TEXT
);
CREATE INDEX idx_sync_logs_store ON sync_logs (store_id, started_at);

COMMIT;
