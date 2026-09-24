-- Canal SmartSale: órdenes cuyo `marketingData.utmiCampaign` (VTEX)
-- identifica a uno de los vendedores configurados en
-- `config/smartsale.config.ts` (ej. "1011397082" = Juana Pinilla).
-- Confirmado con datos reales de Pilatos.
--
-- Tablas PARALELAS a las `sales_daily_by_*` existentes, no una columna
-- nueva en ellas: SmartSale es una fracción pequeña de las órdenes de
-- cada tienda, así que agregar la dimensión ahí infllaría el grano de
-- TODAS las filas (incluidas las que no son SmartSale) sin necesidad.
-- Además, sin histórico a propósito (`utmiCampaign` nunca se guardó
-- antes) — estas tablas solo tendrán datos desde que este código empezó
-- a correr en adelante.
--
-- Aditiva, como 0002-0006: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
-- Se aplica con un script puntual (nunca con `npm run db:migrate`).
BEGIN;

-- "Ventas SmartSale" + "ventas por persona" — dimensión = utmi_campaign.
CREATE TABLE IF NOT EXISTS smartsale_daily_by_person (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  utmi_campaign TEXT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_orders INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, utmi_campaign)
);

CREATE TABLE IF NOT EXISTS smartsale_daily_by_discount_bucket (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  discount_percentage INT NOT NULL,
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, discount_percentage)
);

CREATE TABLE IF NOT EXISTS smartsale_daily_by_discount_campaign (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  campaign_name TEXT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_orders INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, campaign_name)
);

CREATE TABLE IF NOT EXISTS smartsale_daily_by_category (
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

CREATE TABLE IF NOT EXISTS smartsale_daily_by_category_brand (
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

CREATE TABLE IF NOT EXISTS smartsale_daily_by_city (
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

CREATE TABLE IF NOT EXISTS smartsale_daily_by_seller (
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

CREATE TABLE IF NOT EXISTS smartsale_daily_by_marketplace (
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

CREATE INDEX IF NOT EXISTS idx_smartsale_person_store_date ON smartsale_daily_by_person (store_id, date);
CREATE INDEX IF NOT EXISTS idx_smartsale_discount_bucket_store_date ON smartsale_daily_by_discount_bucket (store_id, date);
CREATE INDEX IF NOT EXISTS idx_smartsale_discount_campaign_store_date ON smartsale_daily_by_discount_campaign (store_id, date);
CREATE INDEX IF NOT EXISTS idx_smartsale_category_store_date ON smartsale_daily_by_category (store_id, date);
CREATE INDEX IF NOT EXISTS idx_smartsale_category_brand_store_date ON smartsale_daily_by_category_brand (store_id, date);
CREATE INDEX IF NOT EXISTS idx_smartsale_city_store_date ON smartsale_daily_by_city (store_id, date);
CREATE INDEX IF NOT EXISTS idx_smartsale_seller_store_date ON smartsale_daily_by_seller (store_id, date);
CREATE INDEX IF NOT EXISTS idx_smartsale_marketplace_store_date ON smartsale_daily_by_marketplace (store_id, date);

COMMIT;
