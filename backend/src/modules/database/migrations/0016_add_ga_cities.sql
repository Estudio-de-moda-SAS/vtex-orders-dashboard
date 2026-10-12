-- Desglose por ciudad (city de GA4) — qué ciudades generan más interacción
-- (sesiones), para comparar con el desglose de ciudades por VENTAS que ya
-- existe en `sales_daily_by_city`. Alta cardinalidad (igual que landing
-- pages): se guarda solo el Top 20 por día/tienda y el resto se agrupa en
-- una fila "(otros)" — ver `GaReportUtil.rowsToByCity`.
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS ga_daily_by_city (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  city TEXT NOT NULL,
  sessions INT NOT NULL DEFAULT 0,
  total_users INT NOT NULL DEFAULT 0,
  purchases INT NOT NULL DEFAULT 0,
  ga_revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, city)
);
CREATE INDEX IF NOT EXISTS idx_ga_daily_by_city_store_date ON ga_daily_by_city (store_id, date);

COMMIT;
