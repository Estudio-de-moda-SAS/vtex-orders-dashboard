-- Caché de links REALES de producto (VTEX), resuelto por `skuId` contra la
-- API pública de catálogo de VTEX (`/api/catalog_system/pub/products/search`)
-- durante el sync de GA4 — NUNCA en vivo cuando el dashboard consulta. No es
-- una serie diaria: una fila por (tienda, SKU), se actualiza con `ON
-- CONFLICT` si VTEX cambia el slug/referencia de un producto.
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS ga_product_links (
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  item_id TEXT NOT NULL,
  product_url TEXT NOT NULL,
  product_reference TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, item_id)
);

COMMIT;
