-- Agrega el conteo EXACTO de ventas de un conjunto de campañas de
-- descuento seleccionadas, sin doble conteo cuando una orden calificó
-- para varias campañas a la vez (confirmado con datos reales de Pilatos:
-- una sola orden puede traer "BAZAR Jeans Diesel" + "Envío gratis..." +
-- "Cobro máximo de flete" + "BAZAR camisetas Superdry" simultáneamente).
--
-- A diferencia de `sales_daily_by_discount_campaign` (una fila por CADA
-- campaña individual — así que sumar varias filas puede contar la misma
-- orden más de una vez), acá cada orden aporta a UNA sola fila: la de su
-- combinación EXACTA y ordenada de campañas. Como las combinaciones
-- particionan el universo de órdenes sin solaparse entre sí, sumar todas
-- las filas cuyo `campaign_names` intersecta (`&&`) un conjunto de
-- campañas elegido da el total real de esas campañas, sin doble conteo,
-- sin importar cuántas campañas de la selección tenga cada combinación.
--
-- Aditiva, como 0002-0004: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE —
-- ya hay datos históricos reales cargados. Se aplica con un script
-- puntual (nunca con `npm run db:migrate`, que reejecuta 0001 y borraría
-- todo).
BEGIN;

CREATE TABLE IF NOT EXISTS sales_daily_by_campaign_combo (
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

CREATE INDEX IF NOT EXISTS idx_campaign_combo_names ON sales_daily_by_campaign_combo USING GIN (campaign_names);
CREATE INDEX IF NOT EXISTS idx_campaign_combo_store_date ON sales_daily_by_campaign_combo (store_id, date);

COMMIT;
