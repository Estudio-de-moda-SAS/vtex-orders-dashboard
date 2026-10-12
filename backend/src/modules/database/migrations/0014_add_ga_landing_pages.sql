-- Desglose por página de entrada (landingPage de GA4) — qué páginas traen
-- compradores vs. cuáles solo traen tráfico que rebota. Alta cardinalidad
-- (a diferencia de canal/dispositivo, una tienda puede tener cientos de
-- URLs distintas): `GaReportUtil.rowsToByLandingPage` se queda solo con
-- el Top 20 por día/tienda y agrupa el resto en una fila `(otros)`, así
-- esta tabla crece acotada sin importar cuántas páginas tenga el sitio.
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS ga_daily_by_landing_page (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  landing_page TEXT NOT NULL,
  sessions INT NOT NULL DEFAULT 0,
  total_users INT NOT NULL DEFAULT 0,
  purchases INT NOT NULL DEFAULT 0,
  ga_revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, landing_page)
);
CREATE INDEX IF NOT EXISTS idx_ga_daily_by_landing_page_store_date ON ga_daily_by_landing_page (store_id, date);

COMMIT;
