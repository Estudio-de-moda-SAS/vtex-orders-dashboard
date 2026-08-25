/** Formatea un valor numérico como pesos colombianos, ej. $24.997.000 */
export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Formatea un número entero con separador de miles en formato es-CO, ej. 1.250 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}

/** Formatea un porcentaje con un decimal, ej. 12,5% */
export function formatPercentage(value: number): string {
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value)}%`;
}

/** Formatea milisegundos como segundos legibles, ej. 1,3s */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Etiquetas legibles en español para los status más comunes de VTEX. */
const STATUS_LABELS: Record<string, string> = {
  invoiced: 'Facturada',
  'payment-approved': 'Pago aprobado',
  canceled: 'Cancelada',
  'window-to-cancel': 'Ventana de cancelación',
  'ready-for-handling': 'Lista para manejo',
  handling: 'En manejo',
  'payment-pending': 'Pago pendiente',
  invoice: 'Facturando',
  'order-created': 'Orden creada',
  'checking-invoice': 'Revisando factura',
  unknown: 'Desconocido',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Colores semánticos por status para gráficos y badges. */
const STATUS_COLORS: Record<string, string> = {
  invoiced: '#12B76A',
  'payment-approved': '#3D6FE0',
  canceled: '#F04438',
  'payment-pending': '#F79009',
  handling: '#7A8699',
  'ready-for-handling': '#98A2B3',
  'checking-invoice': '#9E77ED',
};

const FALLBACK_STATUS_COLORS = ['#3D6FE0', '#12B76A', '#F79009', '#F04438', '#7A8699', '#9E77ED'];

export function statusColor(status: string, index: number): string {
  return STATUS_COLORS[status] ?? FALLBACK_STATUS_COLORS[index % FALLBACK_STATUS_COLORS.length];
}

/**
 * Orden y etiquetas usadas para el desglose por estado "contabilizado"
 * (facturado, pago aprobado, en manejo, facturando) en los recuadros de
 * conteos y en el comparativo de tiendas. Las keys deben coincidir con las
 * definidas en `backend/src/config/revenue-status.config.ts`.
 */
export const REVENUE_BREAKDOWN_ORDER = ['invoiced', 'payment-approved', 'handling', 'checking-invoice'];

const REVENUE_BREAKDOWN_LABELS: Record<string, string> = {
  invoiced: 'Facturado',
  'payment-approved': 'Pago aprobado',
  handling: 'En manejo',
  'checking-invoice': 'Facturando',
};

export function revenueBreakdownLabel(key: string): string {
  return REVENUE_BREAKDOWN_LABELS[key] ?? statusLabel(key);
}
