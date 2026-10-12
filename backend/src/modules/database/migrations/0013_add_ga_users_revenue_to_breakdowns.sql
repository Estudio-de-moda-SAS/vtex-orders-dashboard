-- Agrega total_users a ga_daily_by_channel/by_device, y ga_revenue a
-- ga_daily_by_device — para que los desgloses por canal y dispositivo
-- muestren los mismos 4 datos que ya se usan para decidir (sesiones,
-- usuarios, compras, ingresos), no solo sesiones+compras.
--
-- Nota: "usuarios" sumado día por día NO es el mismo número que GA4
-- deduplicado para todo el rango de una sola vez (una persona que visita
-- 2 días distintos cuenta 2 veces al sumar) — se expone igual, por ser lo
-- más útil posible con el modelo de agregados diarios, pero el frontend
-- debe aclararlo como aproximado.
--
-- Aditiva: ADD COLUMN con DEFAULT, nunca DROP TABLE.
BEGIN;

ALTER TABLE ga_daily_by_channel
  ADD COLUMN IF NOT EXISTS total_users INT NOT NULL DEFAULT 0;

ALTER TABLE ga_daily_by_device
  ADD COLUMN IF NOT EXISTS total_users INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ga_revenue NUMERIC NOT NULL DEFAULT 0;

COMMIT;
