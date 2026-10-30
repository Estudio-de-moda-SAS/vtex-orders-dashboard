-- Presupuesto del canal SmartSale — reusa el mismo mecanismo de
-- /presupuesto (budgets_daily/budget_multipliers, migración 0009), pero
-- como un canal nuevo ('smartsale') en vez de 'vtex', con su propio
-- multiplicador (puede venir en otra escala que el de VTEX).
--
-- budget_multipliers hoy comparte UN multiplicador por (year, month)
-- entre las 6 marcas VTEX — se le agrega `channel` y se amplía su PK
-- para que 'vtex' y 'smartsale' tengan cada uno el suyo por mes.
--
-- budgets_daily.store_id tiene FK dura contra stores(store_id) — se
-- inserta una fila sintética 'smartsale' para poder guardar ahí el
-- presupuesto del canal. A PROPÓSITO nunca se agrega a
-- getStoresConfig() (eso la metería en el cron de VTEX/GA4/catálogo);
-- StoresRepository.upsertAll solo hace INSERT...ON CONFLICT UPDATE
-- sobre las 6 tiendas reales del config, nunca borra filas ajenas, así
-- que esta fila sobrevive para siempre sin más mantenimiento.
--
-- Aditiva: ADD COLUMN/INSERT con DEFAULT/ON CONFLICT, nunca DROP TABLE.
BEGIN;

ALTER TABLE budget_multipliers ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'vtex';
ALTER TABLE budget_multipliers DROP CONSTRAINT IF EXISTS budget_multipliers_pkey;
ALTER TABLE budget_multipliers ADD CONSTRAINT budget_multipliers_pkey PRIMARY KEY (year, month, channel);

INSERT INTO stores (store_id, name, vtex_account, is_multi_brand)
VALUES ('smartsale', 'SmartSale (canal)', 'smartsale', false)
ON CONFLICT (store_id) DO NOTHING;

COMMIT;
