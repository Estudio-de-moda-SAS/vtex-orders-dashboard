-- Ventas POS del canal SmartSale (API "Conní" del ERP) — mismo host y
-- credenciales que notas crédito (CREDIT_NOTES_CONNI_KEY/TOKEN, reusadas
-- por defecto, ver configuration.ts), SOLO alcanzable desde la VPN de la
-- compañía. A diferencia de notas crédito, esta API NO entrega un id de
-- fila estable, así que no hay upsert por llave: cada sincronización
-- BORRA e INSERTA de nuevo las filas del rango de fechas consultado (ver
-- `PosSalesRepository.replaceRange`), igual criterio que
-- `SalesAggregatesRepository.replaceAggregates`. Se llena con
-- `cli/pos-sales-sync.ts`, corrido manualmente (o programado) desde una
-- máquina conectada a la VPN — nunca desde el cron del backend desplegado.
-- Columnas con el MISMO nombre snake_case que entrega la API, sin
-- renombrar, salvo `store_id`/`is_freight`/`is_credit_note` (calculados).
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS pos_sales (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  co TEXT,
  nro_documento TEXT NOT NULL,
  tipo_docto TEXT NOT NULL,
  id_tipo TEXT,
  tipo TEXT,
  id_categoria TEXT,
  categoria TEXT,
  id_marca TEXT,
  marca TEXT NOT NULL,
  -- Resuelto con `resolvePosStoreIdFromMarca` — a diferencia de notas
  -- crédito, SIEMPRE hay tienda (cualquier marca no listada cae en Pilatos).
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  id_item BIGINT,
  referencia TEXT,
  descripcion_item TEXT,
  nit_vendedor TEXT,
  -- Nombre CRUDO tal cual llega de la API — el nombre "amigable" se arma
  -- en el momento de consultar (`friendlyPosSellerName`), no al guardar,
  -- para que actualizar el mapeo no requiera re-sincronizar histórico.
  nombre_vendedor TEXT,
  cantidad_inv NUMERIC,
  valor_bruto NUMERIC,
  valor_descuento NUMERIC,
  valor_neto NUMERIC NOT NULL DEFAULT 0,
  is_freight BOOLEAN NOT NULL DEFAULT false,
  is_credit_note BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_fecha ON pos_sales (fecha);
CREATE INDEX IF NOT EXISTS idx_pos_sales_store_fecha ON pos_sales (store_id, fecha);
CREATE INDEX IF NOT EXISTS idx_pos_sales_vendedor ON pos_sales (nit_vendedor, fecha);
CREATE INDEX IF NOT EXISTS idx_pos_sales_nro_documento ON pos_sales (nro_documento);

COMMIT;
