-- Módulo GA4 (fase 1) — comportamiento/tráfico de Google Analytics 4,
-- en tablas paralelas a `sales_daily*`, mismo molde que `sales_daily_by_city`
-- (date + year/month generados + store_id + dimensión + métricas).
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

-- Un día + tienda: resumen agregado de sesiones/usuarios/embudo de
-- e-commerce. Una fila en CERO significa "se sincronizó este día y GA
-- reportó cero" — distinto de "no hay fila" (nunca sincronizado). Ver
-- `GaReportUtil.fillMissingDays`.
CREATE TABLE IF NOT EXISTS ga_daily (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  sessions INT NOT NULL DEFAULT 0,
  total_users INT NOT NULL DEFAULT 0,
  new_users INT NOT NULL DEFAULT 0,
  engaged_sessions INT NOT NULL DEFAULT 0,
  item_views INT NOT NULL DEFAULT 0,
  add_to_carts INT NOT NULL DEFAULT 0,
  checkouts INT NOT NULL DEFAULT 0,
  purchases INT NOT NULL DEFAULT 0,
  ga_revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id)
);
CREATE INDEX IF NOT EXISTS idx_ga_daily_store_date ON ga_daily (store_id, date);

-- Desglose por canal (sessionDefaultChannelGroup de GA4).
CREATE TABLE IF NOT EXISTS ga_daily_by_channel (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  channel_group TEXT NOT NULL,
  sessions INT NOT NULL DEFAULT 0,
  purchases INT NOT NULL DEFAULT 0,
  ga_revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, channel_group)
);
CREATE INDEX IF NOT EXISTS idx_ga_daily_by_channel_store_date ON ga_daily_by_channel (store_id, date);

-- Desglose por dispositivo (deviceCategory de GA4).
CREATE TABLE IF NOT EXISTS ga_daily_by_device (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  device_category TEXT NOT NULL,
  sessions INT NOT NULL DEFAULT 0,
  purchases INT NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, device_category)
);
CREATE INDEX IF NOT EXISTS idx_ga_daily_by_device_store_date ON ga_daily_by_device (store_id, date);

COMMIT;
