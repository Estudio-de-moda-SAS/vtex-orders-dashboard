-- UPT (unidades ÷ órdenes) por tienda, en el Dashboard y en SmartSale.
--
-- `sales_daily` (totales por tienda del Dashboard) ya tenía `units`,
-- pero SIN filtrar por estado contabilizado — mismo problema, y mismo
-- arreglo, que la migración 0010 para otras tablas `by_*`: se agrega
-- `revenue_units` (solo estados contabilizados) sin tocar `units`.
--
-- `smartsale_daily_by_person` (canal SmartSale por vendedor/tienda) no
-- tenía ninguna columna de unidades — se agregan ambas (`units` y
-- `revenue_units`), igual criterio que `sales_daily_by_category`/`by_brand`.
--
-- Aditiva: ADD COLUMN con DEFAULT, nunca DROP TABLE — ya hay datos
-- históricos reales cargados. El histórico pre-existente queda en 0
-- hasta correr el backfill (`npm run import:historico` / `npm run
-- backfill`) para repoblarlo con estas columnas nuevas.
BEGIN;

ALTER TABLE sales_daily
  ADD COLUMN IF NOT EXISTS revenue_units INT NOT NULL DEFAULT 0;

ALTER TABLE smartsale_daily_by_person
  ADD COLUMN IF NOT EXISTS units INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_units INT NOT NULL DEFAULT 0;

COMMIT;
