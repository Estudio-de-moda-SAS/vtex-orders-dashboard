import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { StoreConfig } from '../../../config/stores.config';
import { PG_POOL } from '../pg-pool.provider';

/** Mantiene la tabla `stores` en sync con `stores.config.ts` — se llama una vez al boot del backend. */
@Injectable()
export class StoresRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async upsertAll(stores: StoreConfig[]): Promise<void> {
    for (const store of stores) {
      await this.pool.query(
        `INSERT INTO stores (store_id, name, vtex_account, is_multi_brand)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (store_id) DO UPDATE SET
           name = EXCLUDED.name,
           vtex_account = EXCLUDED.vtex_account,
           is_multi_brand = EXCLUDED.is_multi_brand`,
        [store.id, store.name, store.accountName, Boolean(store.isMultiBrand)],
      );
    }
  }
}
