-- Notas crédito ERP ("NVF-…") dentro de `erp_sales`. Hasta ahora el sync
-- las descartaba; desde esta versión se guardan con `is_credit_note =
-- true` (valor y cantidad NEGATIVOS, tal cual el ERP) para mostrarlas
-- aparte en "Ventas ERP" de `/smartsale` (cantidad y valor por marca y
-- vendedor). NUNCA se restan: todas las consultas de venta filtran
-- `NOT is_credit_note` (ver `ErpSalesRepository`). Las filas existentes
-- son todas facturas (false); para tener las NVF de un rango ya
-- sincronizado hay que volver a correr el sync. Aditiva.
BEGIN;

ALTER TABLE erp_sales ADD COLUMN IF NOT EXISTS is_credit_note BOOLEAN NOT NULL DEFAULT false;

COMMIT;
