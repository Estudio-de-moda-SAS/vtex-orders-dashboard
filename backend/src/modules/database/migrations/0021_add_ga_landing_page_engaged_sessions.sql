-- Sesiones CON interacción por página de entrada — para poder calcular la
-- tasa de rebote (1 - engaged/sessions) por página, igual que ya se hace a
-- nivel general en `/analytics` (ver `ga_daily.engaged_sessions`).
-- Aditiva: ADD COLUMN IF NOT EXISTS, nunca DROP.
BEGIN;

ALTER TABLE ga_daily_by_landing_page ADD COLUMN IF NOT EXISTS engaged_sessions INT NOT NULL DEFAULT 0;

COMMIT;
