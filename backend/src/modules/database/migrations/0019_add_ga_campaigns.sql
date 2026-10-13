-- Desglose por campaña (sessionCampaignName + sessionSourceMedium de GA4) —
-- qué campaña con UTM (ej. "pilatos-bazar-on-off-promo-email-on-9102026")
-- trajo qué resultado, y desde qué fuente/medio (ej. "woowup / email").
-- A diferencia de landing pages/ciudades/productos, NO se aplica tope
-- Top 20 ni agrupación "(otros)": las campañas son deliberadas (alguien
-- las crea por cada promo/envío), no un valor de cardinalidad creciente
-- sin límite, así que se guardan TODAS completas — necesario para poder
-- buscar cualquier campaña por nombre más adelante (ver `GaCampaignFilter`
-- en el frontend, que filtra sobre la lista completa).
-- Métricas de EMBUDO (sessions/addToCarts/checkouts/purchases/gaRevenue),
-- no solo sessions/totalUsers/purchases como el resto de desgloses — para
-- poder ver "cuántos agregaron al carrito" igual que el reporte de GA4.
-- Aditiva: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE.
BEGIN;

CREATE TABLE IF NOT EXISTS ga_daily_by_campaign (
  date DATE NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  month INT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
  store_id TEXT NOT NULL REFERENCES stores(store_id),
  campaign_name TEXT NOT NULL,
  source_medium TEXT NOT NULL,
  sessions INT NOT NULL DEFAULT 0,
  add_to_carts INT NOT NULL DEFAULT 0,
  checkouts INT NOT NULL DEFAULT 0,
  purchases INT NOT NULL DEFAULT 0,
  ga_revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_id, campaign_name, source_medium)
);
CREATE INDEX IF NOT EXISTS idx_ga_daily_by_campaign_store_date ON ga_daily_by_campaign (store_id, date);

COMMIT;
