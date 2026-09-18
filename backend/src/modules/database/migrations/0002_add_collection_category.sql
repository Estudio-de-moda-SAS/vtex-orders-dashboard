-- Cruce colección × categoría (ej. "Rack" × "Camisetas") — pedido para
-- saber, dentro de la colección más vendida, en qué categoría se están
-- vendiendo esos productos y con qué valor. Mismo patrón que
-- sales_daily_by_category_brand (unidades/ventas, sin columnas revenue_*
-- — igual que ese cruce, es una vista de "todas las órdenes", no
-- filtrada por status contabilizado).
--
-- A DIFERENCIA de 0001_init.sql: esta migración NUNCA hace DROP TABLE —
-- ya hay datos históricos reales cargados (Excel + backfill de VTEX) y
-- no se puede volver a ejecutar 0001 sin borrarlos. `db:migrate` corre
-- TODOS los archivos de esta carpeta en cada ejecución, así que cualquier
-- migración nueva de acá en adelante debe ser aditiva (CREATE TABLE IF
-- NOT EXISTS / ALTER TABLE), nunca destructiva.
BEGIN;

CREATE TABLE IF NOT EXISTS sales_daily_by_collection_category (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  collection_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  units INT NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, collection_name, category_name)
);
CREATE INDEX IF NOT EXISTS idx_sdbcc_store_date ON sales_daily_by_collection_category (store_id, date);

COMMIT;
