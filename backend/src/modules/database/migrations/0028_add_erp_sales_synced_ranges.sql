-- Rangos de días ya sincronizados contra el ERP (facturas, `erp_sales`).
-- Hace falta porque un día sin facturas (domingo, festivo) no deja
-- ninguna fila en `erp_sales`: con solo `MIN(fecha)` no se distingue "no
-- se sincronizó" de "se sincronizó y no hubo ventas" (caso real: 1-2 nov
-- 2026). `ErpSalesRepository.replaceRange` registra cada tramo en la MISMA
-- transacción. La cobertura ERP (avisos de "solo POS" en el Resumen de
-- SmartSale) se calcula desde aquí. Aditiva: CREATE TABLE IF NOT EXISTS.
BEGIN;

CREATE TABLE IF NOT EXISTS erp_sales_synced_ranges (
  from_day DATE NOT NULL,
  to_day DATE NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_day, to_day)
);

COMMIT;
