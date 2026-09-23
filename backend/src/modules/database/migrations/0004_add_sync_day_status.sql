-- Rastrea, por (tienda, día), si la última corrida que calculó ese día
-- (cron, backfill manual o resync) obtuvo el conteo COMPLETO que VTEX
-- reportó o si quedó "partial" (ver VtexOrdersService.isWindowClosed /
-- FetchStoreOrdersResult.isComplete) — confirmado en producción que el
-- buscador de órdenes de VTEX puede ser inestable en el límite entre
-- páginas incluso para una ventana ya cerrada.
--
-- Antes, la única señal de "¿esto está bien?" era `sync_logs.status` de
-- la corrida MÁS RECIENTE de la tienda completa, sin importar si esa
-- corrida tocó los días que el usuario está viendo en el dashboard — un
-- indicador global e irrelevante para el rango consultado. Esta tabla
-- permite responder la pregunta correcta: "¿los DÍAS que estoy viendo
-- ahora tienen alguna duda conocida?", sin que el usuario tenga que
-- comparar manualmente contra VTEX cada vez.
--
-- Aditiva, como 0002/0003: CREATE TABLE IF NOT EXISTS, nunca DROP TABLE —
-- ya hay datos históricos reales cargados. Se aplica con un script
-- puntual (nunca con `npm run db:migrate`, que reejecuta 0001 y borraría
-- todo).
BEGIN;

CREATE TABLE IF NOT EXISTS sync_day_status (
  store_id TEXT NOT NULL,
  date DATE NOT NULL,
  is_complete BOOLEAN NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, date)
);

COMMIT;
