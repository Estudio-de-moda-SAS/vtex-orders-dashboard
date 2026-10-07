-- Agrega columnas revenue_units/revenue_sales a sales_daily_by_discount_bucket
-- y sales_daily_by_brand_discount_bucket — mismo problema y mismo arreglo
-- que 0003 (revenue_orders/revenue_sales en sales_daily_by_discount_campaign):
-- estas tablas guardaban units/sales de TODAS las órdenes sin filtrar por
-- estado (incluidas canceladas), mientras el resto del dashboard ("ventas")
-- solo cuenta estados contabilizados (ver revenue-status.config.ts) —
-- confirmado en producción: el cuadro de "descuento más aplicado" de
-- Pilatos sumaba ~$16M más que el total real de ventas del mismo rango,
-- justo la plata de órdenes canceladas/no contabilizadas.
--
-- Aditiva: ADD COLUMN con DEFAULT, nunca DROP TABLE — ya hay datos
-- históricos reales cargados.
BEGIN;

ALTER TABLE sales_daily_by_discount_bucket
  ADD COLUMN IF NOT EXISTS revenue_units INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_sales NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE sales_daily_by_brand_discount_bucket
  ADD COLUMN IF NOT EXISTS revenue_units INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_sales NUMERIC NOT NULL DEFAULT 0;

COMMIT;
