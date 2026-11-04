export interface RevenueStatusDefinition {
  /** Clave interna, usada solo para logs/depuración. */
  key: string;
  /** Etiqueta legible. */
  label: string;
  /**
   * Coincidencias exactas contra `order.status` (código interno de VTEX),
   * comparadas sin distinguir mayúsculas/minúsculas.
   */
  statusMatchers: string[];
  /**
   * Coincidencias por substring contra `order.statusDescription` (texto
   * legible que entrega VTEX), comparadas sin distinguir mayúsculas ni
   * tildes. Sirven como respaldo cuando el código exacto de `status` varía
   * entre cuentas VTEX.
   */
  descriptionMatchers: string[];
  /**
   * Tiendas (`StoreConfig.id`) en las que este estado NO cuenta como
   * contabilizado aunque la orden lo tenga. Opcional — si se omite, el
   * estado cuenta en todas las tiendas. Ver `waiting-ffmt-authorization` y
   * `waiting-for-seller-decision`.
   */
  excludedStoreIds?: string[];
}

/**
 * Estados que se consideran para el indicador "totalizado" del dashboard
 * (antes llamado "invoiced"): ahora no solo se cuenta `invoiced`, sino
 * también `payment-approved`, `handling`, `checking-invoice` y
 * `waiting-ffmt-authorization` y `waiting-for-seller-decision` (estos dos
 * últimos excepto en Pilatos, ver `excludedStoreIds`).
 *
 * Si en tu cuenta VTEX el código exacto de alguno de estos estados es
 * distinto, agrega el valor real a `statusMatchers` o `descriptionMatchers`
 * correspondiente — no hace falta tocar ningún otro archivo, este es el
 * único lugar donde se define la lista.
 *
 * Para depurar qué texto exacto entrega tu cuenta VTEX, revisa el desglose
 * "Estados" que ya se muestra en cada tarjeta de tienda: ahí aparecen
 * tal cual los valores de `status` que trae la API.
 */
export function getRevenueStatusDefinitions(): RevenueStatusDefinition[] {
  return [
    {
      key: 'invoiced',
      label: 'Facturada',
      statusMatchers: ['invoiced'],
      descriptionMatchers: ['facturad', 'faturad'],
    },
    {
      key: 'payment-approved',
      label: 'Pago aprobado',
      statusMatchers: ['payment-approved'],
      // 'approve payment': variante real observada en el histórico de
      // Excel de al menos una cuenta (Pilatos).
      descriptionMatchers: ['pago aprobado', 'pagamento aprovado', 'approve payment'],
    },
    {
      key: 'handling',
      label: 'En manejo',
      statusMatchers: ['handling', 'ready-for-handling'],
      // 'ready for handling' (con espacios): variante real observada en el
      // histórico de Excel de al menos una cuenta — no matchea
      // 'ready-for-handling' (con guiones) por comparación exacta.
      descriptionMatchers: ['en manejo', 'em tratamento', 'listo para manejo', 'ready for handling'],
    },
    {
      key: 'checking-invoice',
      label: 'Facturando',
      // `invoice` es el status de VTEX para "generando factura" (Facturando);
      // `checking-invoice`/`invoice-checking` es un status distinto ("revisando
      // factura"), pero ambos se agrupan aquí porque el dashboard solo
      // necesita distinguir "en proceso de facturación" de "ya facturada"
      // (`invoiced`). Si tu cuenta VTEX usa otro código para esto, agrégalo
      // a `statusMatchers`/`descriptionMatchers`.
      statusMatchers: ['checking-invoice', 'invoice-checking', 'invoice'],
      descriptionMatchers: [
        'revisando factura',
        'verificando factura',
        'checking invoice',
        'facturando',
        'faturando',
      ],
    },
    {
      key: 'waiting-ffmt-authorization',
      label: 'Esperando autorización de despacho',
      // Estado de transición (como `handling` o `invoice`) que VTEX asigna
      // cuando una orden tuvo un cambio y queda esperando autorización
      // antes de seguir a facturada. Existe en las 6 tiendas, pero por
      // decisión de negocio en Pilatos NO cuenta como contabilizado; en
      // Diesel, Superdry, Kipling, Girbaud y Replay sí. Empezó a aparecer
      // en órdenes activas desde octubre 2026 (las más viejas ya pasaron a
      // `invoiced`).
      statusMatchers: ['waiting-ffmt-authorization'],
      descriptionMatchers: [],
      excludedStoreIds: ['pilatos'],
    },
    {
      key: 'waiting-for-seller-decision',
      label: 'Esperando decisión del seller',
      // Mismo criterio que `waiting-ffmt-authorization`: estado de
      // transición, la orden ya está pagada y queda esperando que el
      // seller confirme antes de seguir a facturada. Cuenta en Diesel,
      // Superdry, Kipling, Girbaud y Replay; en Pilatos NO, por decisión de
      // negocio. Visto en órdenes de septiembre y octubre de 2026.
      statusMatchers: ['waiting-for-seller-decision'],
      // Textos del export de Excel de VTEX (columnas `Status raw value
      // (temporary)` y `Status`), para que `import:historico` también lo
      // reconozca. Se comparan sin tildes y sin distinguir mayúsculas.
      descriptionMatchers: ['esperando decision del seller', 'aguardando decisao do seller'],
      excludedStoreIds: ['pilatos'],
    },
  ];
}
