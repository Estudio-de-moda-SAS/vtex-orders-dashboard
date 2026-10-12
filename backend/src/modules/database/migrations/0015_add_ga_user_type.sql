-- Desglose por tipo de usuario (newVsReturning de GA4: "new"/"returning"/
-- "(not set)") — responde si los usuarios recurrentes compran más o
-- convierten mejor que los nuevos. Baja cardinalidad (2-3 valores fijos,
-- a diferencia de landing pages), así que no hace falta un tope ni una
-- fila "(otros)".
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS ga_daily_by_user_type (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  user_type TEXT NOT NULL,
  sessions INT NOT NULL DEFAULT 0,
  total_users INT NOT NULL DEFAULT 0,
  purchases INT NOT NULL DEFAULT 0,
  ga_revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, user_type)
);
CREATE INDEX IF NOT EXISTS idx_ga_daily_by_user_type_store_date ON ga_daily_by_user_type (store_id, date);

COMMIT;
