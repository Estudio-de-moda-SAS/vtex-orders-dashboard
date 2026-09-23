-- "Compras reales": VTEX parte una misma compra en varias órdenes cuando
-- sus productos se despachan por separado (mismo número base, sufijo
-- final -01/-02... distinto, ej. "1663751104761-01" y
-- "1663751104761-02" son la MISMA compra) — confirmado con datos reales
-- de Pilatos (mismos ítems/campañas en ambos fragmentos). Hoy cada
-- fragmento se cuenta como una orden separada en `orders`.
--
-- `real_orders`/`real_revenue_orders` son un conteo APARTE, deduplicado
-- por número base — solo para la card de cada tienda (ver
-- `daily-aggregator.ts` → `countRealOrdersByDay`), nunca reemplazan
-- `orders`/`revenue_*` en esta ni en ninguna otra tabla.
--
-- Aditiva, como 0002-0005: ALTER TABLE ADD COLUMN, nunca DROP TABLE — ya
-- hay datos históricos reales cargados. Se aplica con un script puntual
-- (nunca con `npm run db:migrate`, que reejecuta 0001 y borraría todo).
BEGIN;

ALTER TABLE sales_daily
  ADD COLUMN IF NOT EXISTS real_orders INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS real_revenue_orders INT NOT NULL DEFAULT 0;

COMMIT;
