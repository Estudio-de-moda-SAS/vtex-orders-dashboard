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
}

/**
 * Estados que se consideran para el indicador "totalizado" del dashboard
 * (antes llamado "invoiced"): ahora no solo se cuenta `invoiced`, sino
 * también `payment-approved`, `handling` y `checking-invoice`.
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
  ];
}
