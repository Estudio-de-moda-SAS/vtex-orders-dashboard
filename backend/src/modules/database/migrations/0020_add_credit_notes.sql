-- Notas crédito (API externa "Conní" del ERP, SOLO alcanzable desde la VPN
-- de la compañía) — a diferencia de `sales_daily*`, esto NO lo llena un
-- cron del backend desplegado (no tiene cómo llegar a esa red): se llena
-- con `cli/credit-notes-sync.ts`, corrido manualmente (o programado) desde
-- una máquina conectada a la VPN. Columnas con el MISMO nombre snake_case
-- que entrega la API, sin renombrar, para que el mapeo fila→columna sea
-- directo. `store_id` se resuelve comparando `marca` contra el nombre de
-- cada tienda configurada (ver `credit-notes.util.ts`) — `NULL` si no
-- coincide con ninguna (la nota crédito igual se guarda, solo sin tienda
-- asociada).
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS credit_notes (
  rowid_nc BIGINT PRIMARY KEY,
  nota_credito TEXT NOT NULL,
  fecha_nc DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM fecha_nc)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM fecha_nc)) STORED,
  fecha_creacion_nc TIMESTAMP,
  id_cia INT,
  id_co TEXT,
  tienda TEXT,
  marca TEXT NOT NULL,
  store_id TEXT REFERENCES stores(store_id),
  factura_erp TEXT,
  fecha_factura DATE,
  vlr_neto_factura NUMERIC,
  pedido_erp TEXT,
  orden_vtex TEXT,
  razon_nc TEXT,
  vlr_bruto NUMERIC,
  vlr_dscto NUMERIC,
  vlr_impuestos NUMERIC,
  vlr_neto NUMERIC NOT NULL DEFAULT 0,
  total_nc_factura NUMERIC,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_fecha ON credit_notes (fecha_nc);
CREATE INDEX IF NOT EXISTS idx_credit_notes_store_fecha ON credit_notes (store_id, fecha_nc);
CREATE INDEX IF NOT EXISTS idx_credit_notes_orden_vtex ON credit_notes (orden_vtex);

COMMIT;
