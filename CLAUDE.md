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

`/smartsale` tiene 6 pestañas: Ventas VTEX, Ventas POS, Ventas ERP,
Resumen (POS + ERP combinado), Presupuesto e Indicadores (pendiente).

- **Ventas POS** — API "Conní" del ERP (mismo host/credenciales que
  notas crédito), tabla `pos_sales`. Sync manual:
  `npm run pos-sales:sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD` (requiere
  VPN, igual que notas crédito — nunca corre en el backend desplegado).
  `npm run daily-sync -- --from=... --to=...` corre notas crédito +
  ventas POS + ventas ERP en un solo comando (sin rango por defecto, a
  propósito; el usuario siempre corre los últimos 3 días, así lo que el
  ERP factura tarde se completa en la siguiente corrida).
  Como esta API no trae un id de fila estable, cada sync BORRA e INSERTA
  de nuevo el rango pedido (`PosSalesRepository.replaceRange`), nunca
  hace upsert por llave. Reglas de negocio: venta = `valor_neto`
  (incluye flete, YA RESTA notas crédito — es el total definitivo);
  flete detectado por "FLETE" en `referencia`; nota crédito por
  `tipo_docto = "NPE"`; marca→tienda con mapeo manual en
  `pos-sales.util.ts` (todo lo no listado cae en Pilatos); nombre de
  vendedor con mapeo manual (`friendlyPosSellerName`) aplicado al
  CONSULTAR, no al guardar (actualizar el mapeo se refleja en todo el
  histórico sin re-sincronizar). Validado contra la consulta de facturas
  del ERP (CO 810, sin NPE): documento por documento coinciden; la
  consulta de facturas puede traer tarde los documentos del día.
- **Ventas ERP** — facturas del ERP de los vendedores SmartSale (canal
  `'smartsale'` de `erp_sales`, ver sección siguiente), mismo layout que
  Ventas POS: total, por vendedor, por tienda con desglose por vendedor,
  marcas dentro de Pilatos y categorías; cada nivel con total, fletes,
  empaque, productos, facturas, unidades, AVT (total ÷ facturas) y UPT
  (unidades de producto ÷ facturas). Notas crédito (NVF) del canal: se
  MUESTRAN aparte (cantidad y valor por vendedor y por marca) y NUNCA se
  restan — a diferencia de POS, que sí las resta.
- **Resumen** combina POS (`PosSalesQueryService`, por `nit_vendedor`) +
  ERP (`ErpSalesQueryService.getSmartSaleSummary`, por `codigo_vendedor`)
  — `SmartSaleCombinedService`
  (`backend/src/modules/orders/services/smartsale-combined.service.ts`).
  Antes era VTEX + POS (VTEX era un acercamiento hasta tener ERP); la
  pestaña Ventas VTEX sigue existiendo pero ya no entra en el total. Lo
  usan también la pestaña Presupuesto de `/smartsale` y Vico
  (`get_smartsale_sales`, `get_smartsale_budget_vs_actual`). Venta ERP =
  total facturado, sin desglose de fletes/empaque ni notas crédito
  (decisión del usuario: el Resumen queda así; ojo que POS llega neto de
  sus NC y ERP bruto). Emparejamiento por NOMBRE AMIGABLE ("Felipe
  Rengifo", "Juana Pinilla"), idéntico en `pos-sales.util.ts` (POS),
  `erp-sales.util.ts` (`ERP_SMARTSALE_SELLERS`) y `smartsale.config.ts`
  (VTEX) — un vendedor nuevo debe agregarse IDÉNTICO en los mapeos o
  aparecerá dos veces. Categorías: las del ERP traen código ("101B -
  CAMISETA M/C"); se quita (`stripErpCategoryCode`) y coinciden exacto con
  POS. Tendencia mensual: meses anteriores al primer día ERP sincronizado
  salen solo POS, marcados "Solo POS" y SIN % de crecimiento (se
  completan cuando llegue el histórico ERP por Excel) —
  `buildCombinedMonthlyTrend` en `smartsale-combined.util.ts`.

## Ventas ERP (`/presupuesto` y `/smartsale`)

Facturas del ERP — API "Conní", consulta
`estudiodemoda_Facuras_Ecommerce`, mismas credenciales que notas crédito,
tabla `erp_sales` (migraciones 0026-0029). Sync:
`npm run erp-sales:sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD` (requiere
VPN), también incluido en `npm run daily-sync`. La consulta es pesada:
el sync la pide en tramos de 3 días (`ERP_SALES_CHUNK_DAYS`) y guarda
cada tramo apenas llega (BORRA e INSERTA el rango, igual que `pos_sales`)
y lo registra en `erp_sales_synced_ranges` (0028) — la cobertura ERP se
calcula desde ahí, no con `MIN(fecha)`: un día sin facturas (domingo,
festivo) no deja filas. Histórico antes de nov-2026 llegará por Excel.

- Reglas de negocio en `backend/src/common/utils/erp-sales.util.ts`
  (con pruebas): CO→marca (199 Pilatos, 202 Replay, 203 Kipling, 204
  Girbaud, 208 Diesel, 209 Superdry). SE EXCLUYEN en ambos canales: CO
  810 (SmartSale, otra fuente), CO 956 "REPLAY EDEN BOGOTA" (pendiente de
  validar por el usuario — `PENDING_VALIDATION_COS`) y cualquier otro CO.
- Canal (`channel`, 0027): vendedores 082P (Juana Pinilla) / 168A
  (Felipe Rengifo), sin distinguir mayúsculas → `'smartsale'`
  (`/smartsale` → Ventas ERP); el resto → `'ecommerce'` (`/presupuesto`).
- Notas crédito "NVF-…" (0029): se GUARDAN con `is_credit_note = true`
  (valor y cantidad negativos) y TODAS las consultas de venta las
  excluyen — nunca se restan. Solo se muestran en Ventas ERP de
  `/smartsale`; las de e-commerce ya tienen su pestaña de notas crédito.
- Venta = `valor_neto` (con IVA). Flete: `desc_item` contiene "FLETE" o
  `tipo` "NA - NO APLICA"; empaque: `desc_item` empieza por "CONSUMO" o
  `tipo` "741 - MATERIAL DE EMPAQUE" (la descripción gana sobre `tipo`
  NA). El presupuesto se mide contra el TOTAL (incluye fletes y empaque);
  "Ventas productos" = total − fletes − empaque es solo informativo. El
  empaque hoy viene facturado en $0 (esperado, confirmado por el usuario).
- Presupuesto e-commerce: canal `'erp'` en `budgets_daily`, por las 6
  marcas, mismo panel "Crear presupuesto" que VTEX. La pestaña VTEX y la
  ERP de `/presupuesto` son el mismo componente (`ChannelBudgetTab` en
  `VtexBudgetTab.tsx`) con un `ChannelBudgetConfig` distinto — un cambio
  de layout aplica a ambas.
- Sin VPN, Windows corta la conexión con `ETIMEDOUT` a los ~21s; el
  cliente ERP lo distingue de un timeout real por el tiempo transcurrido
  y lo reporta como "conéctate a la VPN".
- Pendiente: "Resumen" de `/presupuesto` (margen, utilidad, ventas por
  categoría y filtros).

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
`/resumen`, `/smartsale` y `/presupuesto` (sus pestañas también cachean
por rango — ej. `presupuesto-comparison:v2`, `smartsale-budget-comparison:v2`).

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

## "Compras reales" (`real_orders` / `real_revenue_orders`)

VTEX parte una compra en fragmentos `-01`, `-02`... (`extractOrderBaseId`
en `backend/src/common/aggregation/daily-aggregator.ts`). La regla quita
SOLO un sufijo final de **exactamente 2 dígitos** (`/-\d{2}$/`). Antes era
`/-\d+$/`, y eso juntaba como UNA sola compra todas las órdenes de tipo
prefijo+número (ej. `RVS-2803776`, `RVS-2808049` → "RVS"). Se detectó
validando contra el export de VTEX de Kipling oct-2026: 788 en el Excel
vs 776 en VICA.

- La forma de validar es con el export de órdenes de VTEX (una fila por
  SKU): agrupar por `Order`, quitar el `-NN` y contar los números base
  donde al menos un fragmento tenga un estado contabilizado.
- `sales_daily` solo guarda totales por día, sin números de orden.
  Corregir este cálculo para días ya guardados exige resincronizar
  (`npm run backfill` o "Resincronizar" en el dashboard). No se puede
  corregir con SQL sobre Supabase.
- El import desde Excel (`import:historico`) NO reconoce los textos
  "Preparando" ni "Esperando autorización para fulfillment" de la columna
  `Status raw value (temporary)`, así que esas órdenes quedan como no
  contabilizadas. Para recalcular, preferir el backfill desde la API de
  VTEX.
