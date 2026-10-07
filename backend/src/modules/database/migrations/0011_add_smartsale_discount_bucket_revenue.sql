-- Mismo arreglo que 0010, para la tabla paralela del canal SmartSale
-- (smartsale_daily_by_discount_bucket) — comparte el mismo componente de
-- frontend (StoreDiscountBreakdown) que las tablas generales, así que
-- tenía el mismo problema: units/sales sin filtrar por estado.
--
-- Aditiva: ADD COLUMN con DEFAULT, nunca DROP TABLE.
BEGIN;

ALTER TABLE smartsale_daily_by_discount_bucket
  ADD COLUMN IF NOT EXISTS revenue_units INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_sales NUMERIC NOT NULL DEFAULT 0;

COMMIT;
