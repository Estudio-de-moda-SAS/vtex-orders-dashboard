-- Desglose por PRODUCTO (item-scoped de GA4: itemId/itemName/itemCategory)
-- — responde "¿qué productos se ven mucho pero no se compran?" vs. "¿cuáles
-- sí convierten?". Métricas de ítem, DISTINTAS a sessions/totalUsers que
-- usan los demás desgloses (un producto no tiene "sesiones" propias, tiene
-- vistas/agregados al carrito/compras de ESE ítem).
-- Alta cardinalidad (igual que landing pages/ciudades): Top 20 por
-- día/tienda, el resto se agrupa en una fila "(otros)" — ver
-- `GaReportUtil.rowsToByProduct`.
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS ga_daily_by_product (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  item_id TEXT NOT NULL,
  -- Descriptivos, no parte de la PK — se guarda el último valor visto para este item_id/día.
  item_name TEXT NOT NULL,
  item_category TEXT NOT NULL,
  items_viewed INT NOT NULL DEFAULT 0,
  items_added_to_cart INT NOT NULL DEFAULT 0,
  items_purchased INT NOT NULL DEFAULT 0,
  item_revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_ga_daily_by_product_store_date ON ga_daily_by_product (store_id, date);

COMMIT;
