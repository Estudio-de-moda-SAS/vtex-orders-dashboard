-- Agrega columnas revenue_orders/revenue_sales a sales_daily_by_discount_campaign
-- para poder filtrar campañas por "ventas contabilizadas" (mismo criterio
-- que el resto del dashboard, ver revenue-status.config.ts) — sin esto,
-- "campaña más usada" contaba órdenes canceladas/otros estados, mientras
-- que las tarjetas de tienda ya solo cuentan ventas contabilizadas,
-- haciendo que los totales no cuadraran entre sí.
--
-- Aditiva, como 0002: ADD COLUMN con DEFAULT, nunca DROP TABLE — ya hay
-- datos históricos reales cargados.
BEGIN;

ALTER TABLE sales_daily_by_discount_campaign
  ADD COLUMN IF NOT EXISTS revenue_orders INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_sales NUMERIC NOT NULL DEFAULT 0;

COMMIT;
