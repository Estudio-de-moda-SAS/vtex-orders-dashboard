-- Facturas e-commerce del ERP (API "Conní", consulta
-- `estudiodemoda_Facuras_Ecommerce`) — mismo host y credenciales que
-- notas crédito / ventas POS, SOLO alcanzable desde la VPN. Una fila por
-- línea de factura. Se guardan SOLO las líneas que cuentan como venta de
-- la tienda virtual: el sync ya descarta notas crédito ("NVF-..."), el
-- CO 810 y cualquier CO fuera de las 6 marcas, y los vendedores SmartSale
-- (082P/168A) — ver `erp-sales.util.ts`.
--
-- Igual que `pos_sales`, la API no trae un id de fila estable: cada sync
-- BORRA e INSERTA el rango consultado (`ErpSalesRepository.replaceRange`).
-- `store_id`/`line_kind` son calculados; el resto conserva el nombre
-- snake_case de la API. Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP.
BEGIN;

CREATE TABLE IF NOT EXISTS erp_sales (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  co TEXT NOT NULL,
  desc_co TEXT,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  nro_documento TEXT NOT NULL,
  docto_referencia TEXT,
  docto_remision TEXT,
  codigo_vendedor TEXT,
  estado_docto TEXT,
  cliente_factura TEXT,
  bodega TEXT,
  item BIGINT,
  referencia TEXT,
  desc_item TEXT,
  cantidad NUMERIC,
  valor_neto NUMERIC NOT NULL DEFAULT 0,
  valor_bruto NUMERIC,
  valor_descuentos NUMERIC,
  valor_impuestos NUMERIC,
  valor_subtotal NUMERIC,
  marca TEXT,
  categoria TEXT,
  tipo TEXT,
  costo_promedio_total NUMERIC,
  utilidad_promedio NUMERIC,
  pedido_vtex TEXT,
  -- 'product' | 'freight' | 'packaging' — ver `classifyErpLine`.
  line_kind TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_sales_fecha ON erp_sales (fecha);
CREATE INDEX IF NOT EXISTS idx_erp_sales_store_fecha ON erp_sales (store_id, fecha);

COMMIT;
