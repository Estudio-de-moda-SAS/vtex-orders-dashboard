-- Canal de cada línea de `erp_sales` (migración 0026): la MISMA consulta
-- del ERP trae las facturas de las tiendas virtuales ('ecommerce',
-- `/presupuesto`) y las de los vendedores SmartSale 082P/168A
-- ('smartsale', `/smartsale` → "Ventas ERP") — ver `resolveErpChannel`.
-- Las filas existentes son todas 'ecommerce' (hasta ahora las de
-- SmartSale se descartaban al sincronizar), así que el DEFAULT es correcto;
-- para tener las de SmartSale de un rango ya sincronizado hay que volver
-- a correr el sync de ese rango.
-- `codigo_vendedor` se guarda normalizado (mayúsculas, sin espacios) desde
-- esta versión del sync. Aditiva: ADD COLUMN IF NOT EXISTS, nunca DROP.
BEGIN;

ALTER TABLE erp_sales ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'ecommerce';
CREATE INDEX IF NOT EXISTS idx_erp_sales_channel_fecha ON erp_sales (channel, fecha);

COMMIT;
