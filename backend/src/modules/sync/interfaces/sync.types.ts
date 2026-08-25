import { StoreConfig } from '../../../config/stores.config';
import { OrderSourceRef } from '../../storage/repositories/orders-cache.repository';

export interface SourceDefinition {
  ref: OrderSourceRef;
  extraParams?: Record<string, string>;
  /** Etiqueta legible, solo para logs (ej. "Pilatos" o "Pilatos · seller Armo studio"). */
  label: string;
}

export interface ResolvedSourceData {
  ref: OrderSourceRef;
  label: string;
  orders: import('../../orders/interfaces/vtex-order.interface').VtexOrder[];
  /** `true` si no quedó ningún día pendiente de sincronizar (ni en caché, ni en vivo). */
  isComplete: boolean;
}

export interface ResolveRangeResult {
  sources: ResolvedSourceData[];
  /** `true` si se lanzó (o ya había) un job de fondo con días pendientes por traer. */
  backgroundSyncInProgress: boolean;
  backgroundJobId?: string;
  /** Cuántos días "cerrados" nunca sincronizados quedaron pendientes (en caché o en el job de fondo). */
  pendingClosedDays: number;
}
