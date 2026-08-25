import { Injectable } from '@nestjs/common';

import { getStoresConfig } from '../../config/stores.config';

/** Información de tienda segura para exponer al frontend (sin credenciales). */
export interface PublicStoreInfo {
  id: string;
  name: string;
  color: string;
  configured: boolean;
}

@Injectable()
export class StoresService {
  getPublicStores(): PublicStoreInfo[] {
    return getStoresConfig().map((store) => ({
      id: store.id,
      name: store.name,
      color: store.color,
      // Indica si la tienda tiene credenciales cargadas, sin revelarlas.
      configured: Boolean(store.appKey && store.appToken),
    }));
  }
}
