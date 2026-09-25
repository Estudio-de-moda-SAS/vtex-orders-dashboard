-- Igual que 0005 (sales_daily_by_campaign_combo), pero solo para órdenes
-- del canal SmartSale — permite un total EXACTO (sin doble conteo) de un
-- conjunto de campañas de descuento seleccionadas dentro de SmartSale,
-- igual que ya existe para el dashboard general. Sin esto, filtrar varias
-- campañas de SmartSale a la vez (ej. un "bazar" completo) solo puede
-- sumar las filas individuales de `smartsale_daily_by_discount_campaign`,
-- lo que sobreconté cuando una orden calificó para varias campañas
-- seleccionadas a la vez.
--
-- Aditiva, como 0002-0007: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE —
-- ya hay datos históricos reales cargados. Se aplica con un script
-- puntual (nunca con `npm run db:migrate`, que reejecuta 0001 y borraría
-- todo).
BEGIN;

CREATE TABLE IF NOT EXISTS smartsale_daily_by_campaign_combo (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  combo_key TEXT NOT NULL,
  campaign_names TEXT[] NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  revenue_orders INT NOT NULL DEFAULT 0,
  revenue_sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, combo_key)
);

CREATE INDEX IF NOT EXISTS idx_smartsale_campaign_combo_names ON smartsale_daily_by_campaign_combo USING GIN (campaign_names);
CREATE INDEX IF NOT EXISTS idx_smartsale_campaign_combo_store_date ON smartsale_daily_by_campaign_combo (store_id, date);

COMMIT;
