-- Costo promedio UNITARIO de cada línea (`costo_promedio_uni_inst` de la
-- API) — fórmula de margen definida por el usuario:
--   costo total = costo_promedio_uni_inst × cantidad
--   margen      = (valor_subtotal − costo total) / valor_subtotal
-- Las filas ya guardadas quedan en NULL hasta el próximo sync; mientras
-- tanto el cálculo usa `costo_promedio_total` (mismo valor en los casos
-- revisados — ver `ErpSalesRepository.getMarginRows`). Aditiva.
BEGIN;

ALTER TABLE erp_sales ADD COLUMN IF NOT EXISTS costo_promedio_uni_inst NUMERIC;

COMMIT;
