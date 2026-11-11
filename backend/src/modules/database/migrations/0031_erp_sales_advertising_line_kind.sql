-- Material publicitario (tipo "801 - MATERIAL PUBLICITARIO": portadocumentos,
-- pines, muestras) — facturado en $0 con costo. Hasta ahora `classifyErpLine`
-- lo dejaba como 'product' y bajaba el margen, aparecía en el ranking de
-- tipos y sumaba unidades. Desde esta versión es `line_kind = 'advertising'`
-- (no entra a margen, utilidad, tipos ni unidades — decisión del usuario).
-- Corrige las filas ya guardadas con la MISMA regla del clasificador, sin
-- tener que re-sincronizar. Idempotente.
BEGIN;

UPDATE erp_sales
SET line_kind = 'advertising'
WHERE line_kind = 'product' AND upper(trim(tipo)) LIKE '801%';

COMMIT;
