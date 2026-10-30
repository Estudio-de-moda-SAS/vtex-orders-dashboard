# Equipos y VICA

VICA (Ventas Integradas para Consolidación y Análisis) es el dashboard
interno de Estudio de Moda — consolida VTEX (6 tiendas), Google Analytics
4, POS (ERP "Conní"), notas crédito y presupuesto manual, con un
asistente conversacional ("Vico") encima de todo eso.

## Regla general para todos los equipos

**Ningún equipo (salvo Desarrollo) tiene ni necesita acceso al código.**
El trabajo de cada equipo con VICA es:

1. **Observar** — revisar las páginas de VICA que le corresponden (lista
   abajo) y/o preguntarle a **Vico** directamente desde el chat.
2. **Reportar** — si algo se ve mal, falta un dato, o una cifra no
   cuadra, avisarle a **Desarrollo** con el detalle exacto (qué página,
   qué filtro/fecha, qué se esperaba vs. qué se vio). Desarrollo es el
   único equipo que entra al código a corregirlo.

Nadie más edita archivos, tablas ni configuración — eso evita que un
ajuste "rápido" de alguien sin contexto rompa un cálculo que otro equipo
está usando para tomar una decisión real.

## Cómo hablarle a Vico

Vico responde en español, en el chat flotante disponible en cualquier
página de VICA. Nunca calcula nada por su cuenta — toda cifra que da
viene de una consulta real a la base de datos. Ejemplos de lo que se le
puede preguntar:

- "¿Cuánto vendió Pilatos ayer?" / "¿cuántas órdenes tuvo Kipling esta
  semana?"
- "¿Por qué bajaron las ventas de Diesel este mes?" (análisis con motor
  del cambio: tráfico, conversión o ticket, y a qué equipo avisar)
- "¿Cómo va Superdry contra su presupuesto este mes?"
- "¿Cómo va el canal SmartSale contra su presupuesto?" / "¿cómo va Juana
  vs. su meta?"
- "¿Cuál es el UPT de Girbaud este mes?" (unidades por pedido — ver
  sección "UPT" más abajo)
- "¿Cuántas notas crédito hubo esta semana?"
- "¿Qué tan actualizado está todo?" (estado de sincronización)
- "Busca la campaña 'bazar'"

## Qué es el UPT

UPT = unidades ÷ órdenes contabilizadas — cuántos productos trae en
promedio cada pedido. Se ve en el Dashboard principal (junto al ticket
promedio, en la card de cada tienda) y Vico lo puede dar para cualquier
tienda y rango de fechas.

## Por equipo

### Marketing

Dueño del tráfico y de a dónde se dirige (campañas, canales de
adquisición).

- **`/analytics`** — sesiones, canal, dispositivo, landing pages,
  nuevos/recurrentes, campañas UTM.
- **`/resumen`** — cuando Vico (o el semáforo de esta página) señale
  tráfico o conversión como el "motor"/"freno" del cambio en una tienda,
  es la primera señal para Marketing.
- **`/descuentos`** — qué tan efectivas están siendo las campañas de
  descuento vigentes.
- Preguntarle a Vico: análisis de "por qué cambiaron las ventas" de una
  tienda — si la causa es tráfico o una mezcla de canales, la
  recomendación la dirige a Marketing.

### Producto

Dueño del catálogo, precios/descuentos y la experiencia de compra en el
sitio.

- **`/analytics`** → pestaña de productos — vistas, agregados al
  carrito, compras por producto.
- **`/descuentos`** — distribución de descuentos por producto/categoría.
- **Dashboard principal** — ticket promedio (AVT) y UPT por tienda; una
  caída de cualquiera de los dos es una señal directa para Producto.
- **`/resumen`** — cuando el ticket promedio sea el "motor"/"freno" del
  cambio, o cuando la conversión empeore DENTRO del mismo canal (no por
  mezcla de tráfico).
- Preguntarle a Vico: UPT y ticket promedio de una tienda, o un análisis
  completo que incluya esas dos piezas.

### Marketplace (solo Pilatos)

Dueño de la operación de Pilatos con sellers externos (Disandina, Tennis,
Clemont, Armo Studio) y canales de marketplace (Dafiti y similares).

- **`/pilatos`** — mezcla de ventas por seller/marketplace, participación
  de cada uno.
- **`/analytics`** (filtrado a Pilatos) y **`/metodos-pago`** — cómo se
  comportan esos canales en tráfico y forma de pago.
- Preguntarle a Vico: ventas de Pilatos desglosadas por "seller" o
  "marketplace" (únicos cortes que existen solo para esta tienda).

### Ventas / SmartSale

Dueño del canal de venta asistida por vendedor (link personalizado en
VTEX + ventas por POS físico).

- **`/smartsale`** → las 4 pestañas activas:
  - **Ventas VTEX** — venta por vendedor dentro de VTEX.
  - **Ventas POS** — venta por vendedor en el POS físico (ERP "Conní").
  - **Resumen** — VTEX + POS combinados, por vendedor, por tienda y por
    categoría, con unidades y UPT.
  - **Presupuesto** — presupuesto único del canal completo (no por
    tienda), comparado contra venta real (VTEX + POS — VTEX es un
    acercamiento, la versión exacta será la del ERP cuando exista), con
    el presupuesto repartido en partes iguales entre los vendedores
    activos.
- Preguntarle a Vico: ventas de SmartSale (siempre combina VTEX+POS a
  menos que se pida un canal puntual), cómo va el canal o un vendedor
  contra el presupuesto, categoría más vendida del canal.

### Desarrollo

Único equipo con acceso al código y a la base de datos. Ejecuta:

- Correcciones de datos o cálculos reportadas por los demás equipos (
  nunca por iniciativa propia sin que alguien lo haya confirmado como
  una anomalía real).
- Carga/corrección del multiplicador y los valores de presupuesto en
  `/presupuesto` y `/smartsale` → Presupuesto (requiere el código de
  acceso compartido).
- Sincronización manual cuando algo lo requiera (notas crédito, ventas
  POS — ambas vía VPN, no automáticas).
- Mantenimiento de este archivo y de `CLAUDE.md`/`README.md`.

---

*Este archivo se actualiza cuando cambia qué revisa cada equipo o se
agrega una página/capacidad nueva a VICA — avisarle a Desarrollo si algo
acá queda desactualizado.*
