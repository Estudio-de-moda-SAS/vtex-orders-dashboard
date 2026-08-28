export interface SellerFilterConfig {
  /** Valor exacto a enviar en `f_sellerNames` */
  sellerName: string;
  /** Nombre comercial a mostrar en el dashboard */
  label: string;
}

export interface MarketplaceChannelConfig {
  /** Valor exacto a enviar en `salesChannelId` */
  salesChannelId: string;
  /** Nombre comercial a mostrar en el dashboard */
  label: string;
}

export interface StoreExtraSegments {
  sellers?: SellerFilterConfig[];
  marketplaces?: MarketplaceChannelConfig[];
}

export interface StoreConfig {
  /** Identificador interno usado en la URL de la API y en el frontend */
  id: string;
  /** Nombre visible de la tienda */
  name: string;
  /** accountName de VTEX */
  accountName: string;
  /** Ambiente VTEX, ej. vtexcommercestable */
  environment: string;
  /** Color de marca en formato hexadecimal, usado por el frontend */
  color: string;
  appKey?: string;
  appToken?: string;
  /**
   * Consultas adicionales, independientes de la consulta general de la
   * tienda, cuyos resultados se SUMAN al total de la tienda (además de
   * mostrarse como desglose por separado). Se usa para capturar órdenes
   * de vendedores (sellers) o canales de marketplace específicos que la
   * consulta general no necesariamente refleja de forma desagregada.
   * Por ahora solo está configurado para Pilatos.
   */
  extraSegments?: StoreExtraSegments;
  /**
   * `true` únicamente para tiendas que venden productos de MÚLTIPLES
   * marcas (hoy, solo Pilatos — un marketplace multimarca). El resto de
   * las tiendas son monomarca: cada una vende exclusivamente su propia
   * marca, así que "¿cuál marca vendió más?" no es una pregunta con
   * sentido para ellas (la respuesta sería trivialmente la marca de la
   * propia tienda). `ProductAnalyticsService.getTopBrandByCategory` usa
   * este flag para decidir si el análisis de marca aplica, en vez de un
   * `if (storeId === 'pilatos')` disperso en el código.
   */
  isMultiBrand?: boolean;
}

/**
 * Configuración centralizada de todas las cuentas VTEX que participan
 * en el dashboard. Para agregar una nueva tienda:
 *   1. Agregar una nueva entrada aquí con su `id`, `accountName`, `environment` y `color`.
 *   2. Agregar las variables `<ID>_APP_KEY` y `<ID>_APP_TOKEN` en `.env` y `.env.example`.
 *   3. Reiniciar el backend.
 * No se requiere ningún otro cambio: el resto de la aplicación (paginación,
 * analítica, endpoints, frontend) lee esta lista dinámicamente.
 */
export function getStoresConfig(): StoreConfig[] {
  return [
    {
      id: 'pilatos',
      name: 'Pilatos',
      accountName: 'pilatos21',
      environment: process.env.PILATOS_ENVIRONMENT ?? 'vtexcommercestable',
      color: '#f5c518',
      appKey: process.env.PILATOS_APP_KEY,
      appToken: process.env.PILATOS_APP_TOKEN,
      isMultiBrand: true,
      extraSegments: {
        sellers: [
          { sellerName: 'ARMO STUDIO', label: 'Armo studio' },
          { sellerName: 'Disandina S.A.S', label: 'Disandina S.A.S' },
          { sellerName: 'Tennis SA', label: 'Tennis SA' },
        ],
        marketplaces: [
          { salesChannelId: '25', label: 'Agaval' },
          { salesChannelId: '24', label: 'Addi' },
          { salesChannelId: '2', label: 'Dafiti' },
          { salesChannelId: '21', label: 'Fruta fresca' },
          { salesChannelId: '3', label: 'Puntos colombia' },
          { salesChannelId: '29', label: 'Replaycolombia' },
          { salesChannelId: '28', label: 'Falabella' }
        ],
      },
    },
    {
      id: 'kipling',
      name: 'Kipling',
      accountName: 'kiplingco',
      environment: process.env.KIPLING_ENVIRONMENT ?? 'vtexcommercestable',
      color: '#ff73be',
      appKey: process.env.KIPLING_APP_KEY,
      appToken: process.env.KIPLING_APP_TOKEN,
    },
    {
      id: 'diesel',
      name: 'Diesel',
      accountName: 'dieselcolombia',
      environment: process.env.DIESEL_ENVIRONMENT ?? 'vtexcommercestable',
      color: '#e4002b',
      appKey: process.env.DIESEL_APP_KEY,
      appToken: process.env.DIESEL_APP_TOKEN,
    },
    {
      id: 'superdry',
      name: 'Superdry',
      accountName: 'superdrycolombia',
      environment: process.env.SUPERDRY_ENVIRONMENT ?? 'vtexcommercestable',
      color: '#000',
      appKey: process.env.SUPERDRY_APP_KEY,
      appToken: process.env.SUPERDRY_APP_TOKEN,
    },
    {
      id: 'girbaud',
      name: 'Girbaud',
      accountName: 'girbaud',
      environment: process.env.GIRBAUD_ENVIRONMENT ?? 'vtexcommercestable',
      color: '#001489',
      appKey: process.env.GIRBAUD_APP_KEY,
      appToken: process.env.GIRBAUD_APP_TOKEN,
    },
    {
      id: 'replay',
      name: 'Replay',
      accountName: 'replaycolombia',
      environment: process.env.REPLAY_ENVIRONMENT ?? 'vtexcommercestable',
      color: '#d71920',
      appKey: process.env.REPLAY_APP_KEY,
      appToken: process.env.REPLAY_APP_TOKEN,
    },
  ];
}
