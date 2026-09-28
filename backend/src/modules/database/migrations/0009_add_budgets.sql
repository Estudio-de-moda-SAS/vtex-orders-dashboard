-- Presupuesto (canal VTEX) — herramienta manual de captura, separada de
-- todo el pipeline de sincronización con VTEX (esta tabla nunca se toca
-- desde el cron ni desde ningún importador; se llena a mano desde
-- `/presupuesto`, protegida por un código compartido — ver
-- `BUDGET_ACCESS_CODE`).
--
-- `budget_multipliers`: UN multiplicador por (año, mes), compartido por
-- las 6 marcas a la vez (decisión de negocio confirmada) — permite
-- capturar los valores crudos del presupuesto en la escala que venga en
-- el archivo de origen (ej. "24,5" en vez de "245.000.000") y aplicar el
-- factor de conversión una sola vez por mes.
--
-- `budgets_daily`: un valor crudo por (día, tienda, canal). `channel`
-- queda fijo en 'vtex' por ahora (el backend nunca expone otro valor) —
-- ya se sabe que habrá un presupuesto ERP más adelante, distinto de
-- este, así que la columna se deja preparada desde ya para diferenciarlos
-- sin tener que migrar de nuevo. `budget_value` (raw_value × multiplier)
-- NO se guarda: se calcula en cada lectura via JOIN contra
-- `budget_multipliers`, así que cambiar el multiplicador de un mes
-- actualiza automáticamente todo lo ya cargado ese mes.
--
-- Aditiva, como 0002-0008: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
-- Se aplica con un script puntual (nunca con `npm run db:migrate`, que
-- reejecuta 0001 y borraría todo).
BEGIN;

CREATE TABLE IF NOT EXISTS budget_multipliers (
  year INT NOT NULL,
  month INT NOT NULL,
  multiplier NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (year, month)
);

CREATE TABLE IF NOT EXISTS budgets_daily (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  channel TEXT NOT NULL DEFAULT 'vtex',
  raw_value NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, store_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_budgets_daily_store_month ON budgets_daily (store_id, channel, year, month);

COMMIT;
