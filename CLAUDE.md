# Guía para Claude en este repo

Lee primero `README.md` — es la referencia completa de qué hace el
proyecto, arquitectura, endpoints, variables de entorno y el detalle de
cada módulo (incluida la sección 17, el asistente "Vico"). Este archivo
es el complemento: convenciones de trabajo y lecciones ya aprendidas a
las que vale la pena volver.

## Antes de tocar este archivo: pedir aprobación primero

Cada vez que se construya código nuevo, un proceso/flujo nuevo, o se
corrija un bug con una lección que valga la pena recordar, PROPONER
brevemente qué se agregaría aquí (o a `README.md`) y esperar la
aprobación explícita del usuario antes de escribirlo — nunca actualizar
`CLAUDE.md` por iniciativa propia sin ese visto bueno primero.

## El proyecto en una frase

VICA — dashboard interno de Estudio de Moda (NestJS + Postgres/Supabase
en el backend, Next.js App Router en el frontend) que consolida órdenes
de 6 tiendas VTEX, Google Analytics 4, notas crédito de un ERP interno y
presupuesto manual, con un asistente conversacional ("Vico") encima de
todo eso.

## Regla de diseño que atraviesa todo el proyecto

**El modelo del asistente nunca calcula — todo cómputo determinista vive
en TypeScript puro, con pruebas `node:test`.** Esto no es solo para
sumas/porcentajes: también aplica a decidir si algo "mejoró o empeoró",
a qué equipo avisar, y a confiar en una fecha. Cada vez que algo de esto
se dejó en manos del prompt en vez de en código, resultó inconsistente
entre una corrida y la siguiente (confirmado varias veces en producción
— ver `backend/src/common/utils/team-recommendation.util.ts` y
`sync-freshness.util.ts` como los ejemplos más recientes). Si un fix al
asistente requiere que el modelo "razone" algo que tiene una respuesta
objetivamente correcta, muévelo a una función pura antes de intentar
arreglarlo solo con una instrucción de prompt más fuerte.

## Ventas POS + "Resumen" combinado (`/smartsale`)

`/smartsale` tiene 5 pestañas: Ventas VTEX, Ventas POS, Resumen (VTEX+POS
combinado), Presupuesto e Indicadores (estas 2 últimas pendientes).

- **Ventas POS** — API "Conní" del ERP (mismo host/credenciales que
  notas crédito), tabla `pos_sales`. Sync manual:
  `npm run pos-sales:sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD` (requiere
  VPN, igual que notas crédito — nunca corre en el backend desplegado).
  `npm run daily-sync -- --from=... --to=...` corre notas crédito +
  ventas POS en un solo comando (sin rango por defecto, a propósito).
  Como esta API no trae un id de fila estable, cada sync BORRA e INSERTA
  de nuevo el rango pedido (`PosSalesRepository.replaceRange`), nunca
  hace upsert por llave. Reglas de negocio: venta = `valor_neto`
  (incluye flete, YA RESTA notas crédito — es el total definitivo);
  flete detectado por "FLETE" en `referencia`; nota crédito por
  `tipo_docto = "NPE"`; marca→tienda con mapeo manual en
  `pos-sales.util.ts` (todo lo no listado cae en Pilatos); nombre de
  vendedor con mapeo manual (`friendlyPosSellerName`) aplicado al
  CONSULTAR, no al guardar (actualizar el mapeo se refleja en todo el
  histórico sin re-sincronizar).
- **Resumen** combina VTEX (`SmartSaleService`, vendedor identificado
  por `utmiCampaign`) + POS (`PosSalesQueryService`, por `nit_vendedor`)
  — `SmartSaleCombinedService`
  (`backend/src/modules/orders/services/smartsale-combined.service.ts`).
  El emparejamiento es por NOMBRE AMIGABLE, no por id (son ids de
  sistemas distintos) — funciona porque hoy coincide exactamente
  ("Felipe Rengifo", "Juana Pinilla") entre `smartsale.config.ts` (VTEX)
  y `pos-sales.util.ts` (POS). Si un vendedor nuevo vende por ambos
  canales, su nombre debe agregarse IDÉNTICO en los dos mapeos o el
  emparejamiento no lo va a unir (aparecerá dos veces, una por canal).

## Verificar un cambio al asistente ("Vico")

El prompt del sistema está en `backend/src/modules/assistant/prompts/system-manual.ts`
(constante de TypeScript, no un `.md` — ver el comentario del archivo
sobre por qué). Después de cualquier cambio ahí o en una herramienta:

1. `npm run build` y `npm test` en `backend/` primero.
2. Probar en vivo contra la base real, pero SIN tocar el backend que el
   usuario pueda tener corriendo en el puerto 3001. Patrón ya usado
   muchas veces en este proyecto:
   ```
   PORT=3099 SKIP_AUTO_SYNC=true nohup node dist/main.js > /tmp/x.log 2>&1 &
   ```
   (`SKIP_AUTO_SYNC=true` evita que el boot dispare un ciclo completo de
   VTEX+GA4, que tarda minutos). Probar con `curl -X POST
   http://localhost:3099/api/assistant/chat`, leyendo el stream SSE.
   **Al terminar, siempre matar ese proceso y confirmar con
   `netstat -ano | grep LISTENING | grep ":3099"` que quedó libre** — y
   confirmar por separado que el 3001 (si el usuario lo tenía corriendo)
   sigue intacto. Nunca asumir que `taskkill`/`pkill` funcionó; verificar.
3. El comportamiento del modelo tiene variación de una corrida a otra —
   correr la MISMA pregunta 2-3 veces antes de dar un fix por confirmado,
   no una sola vez.
4. **`assistant_logs` (tabla en la misma base real) es la mejor
   herramienta de debugging que hay** — guarda `tool_calls` completo
   (nombre, input, output exactos) de cada pregunta real que alguien le
   hizo a Vico. Antes de adivinar por qué una respuesta salió mal,
   consultar esa tabla por la pregunta real reportada:
   ```sql
   SELECT question_text, tool_calls, answer_text FROM assistant_logs
   WHERE question_text ILIKE '%...%' ORDER BY created_at DESC LIMIT 5;
   ```
   Esto fue lo que encontró, por ejemplo, el bug real de fecha
   (`resolve_period` devolvía el día correcto y la siguiente llamada
   usaba otro) y el de notas contabilizadas vs. brutas en
   `search_campaign` — ninguno de los dos se habría encontrado adivinando
   desde la descripción del usuario.

## Caché de sessionStorage en el frontend (`useCachedQuery`)

Cualquier cambio en la FORMA de la respuesta de un endpoint que una
página cachea en `sessionStorage` — un campo nuevo, un campo que cambió
de tipo, o una corrección de datos que vino de una importación/reparación
manual de la base (no de código) — rompe a los usuarios que ya tenían
algo guardado con la forma vieja, con errores como "Cannot read
properties of undefined". La corrección SIEMPRE es la misma: subir el
sufijo de versión en la cache key (`"pagina:v3:..."` → `"pagina:v4:..."`)
para esa página. Páginas con este patrón hoy: Dashboard (`page.tsx`),
`/tendencias`, `/descuentos`, `/pilatos`, `/metodos-pago`, `/analytics`,
`/resumen`, `/smartsale`. `/presupuesto` no usa este caché (consulta en
vivo siempre).

## Procesos en segundo plano — compromiso con el usuario

No dejar un backend propio corriendo sin avisar (ver el patrón del
puerto 3099 arriba). Si por algún motivo hay que levantar algo más
persistente, decirlo explícitamente antes y confirmar que se apagó al
terminar. Esto se incumplió varias veces al principio de este proyecto
(colisiones de `EADDRINUSE :::3001` con el backend real del usuario) y
quedó como una regla dura desde entonces.

## Secretos

`backend/.env` tiene credenciales reales (VTEX, Supabase, Google service
account, claves de LLM). Nunca repetir su contenido en una respuesta,
commit o archivo — ver también la nota de la skill de seguridad del
harness. Si hace falta confirmar que una variable tiene valor, usar
`grep -q "^VAR=.\+" .env && echo set` en vez de imprimir el valor.

## Git

El usuario commitea y abre los PR manualmente la mayoría de las veces —
no asumir que hay que hacerlo por iniciativa propia; preguntar o esperar
a que lo pidan explícitamente. Patrón de ramas ya establecido: una rama
`feat/<algo>` por tanda de trabajo, PR contra `main`, merge por GitHub
(ver `git log --oneline` para el historial real de nombres usados).

## Migraciones de base de datos

Las migraciones (`backend/src/modules/database/migrations/*.sql`) son
**aditivas** (`CREATE TABLE IF NOT EXISTS`, nunca `DROP TABLE`) desde
hace tiempo — EXCEPTO `0001_init.sql`, que sí tiene `DROP TABLE ...
CASCADE`. Por eso una migración nueva se aplica con un script de una sola
vez (`Client` de `pg` directo contra `DATABASE_URL`), **nunca con
`npm run db:migrate`**, que re-corre todo el historial desde `0001_init.sql`
y destruiría datos reales.
