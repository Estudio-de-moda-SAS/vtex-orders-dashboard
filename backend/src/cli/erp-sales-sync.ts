import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';

import configuration from '../config/configuration';
import {
  ErpSalesCredentialsMissingError,
  ErpSalesTimeoutError,
  ErpSalesUnreachableError,
} from '../modules/erp-sales/erp-sales-client.service';
import { ErpSalesModule } from '../modules/erp-sales/erp-sales.module';
import { ErpSalesSyncService } from '../modules/erp-sales/erp-sales-sync.service';

/**
 * Sincroniza ventas ERP (facturas e-commerce, API "Conní") → Supabase.
 * Requiere VPN. El rango se pide en tramos de 3 días (ERP_SALES_CHUNK_DAYS)
 * y cada tramo se guarda apenas llega.
 *
 * Uso:
 *   npm run erp-sales:sync -- --from=2026-11-01 --to=2026-11-10
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), ErpSalesModule],
})
class ErpSalesSyncModule {}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' } } });
  if (!values.from || !values.to) {
    console.error('Uso: npm run erp-sales:sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD');
    process.exitCode = 1;
    return;
  }

  console.log(`Sincronizando ventas ERP de ${values.from} a ${values.to}...`);
  const app = await NestFactory.createApplicationContext(ErpSalesSyncModule);
  try {
    const result = await app.get(ErpSalesSyncService).syncRange(values.from, values.to, (msg) => console.log(`  ${msg}`));
    console.log(`\nListo: ${result.saved} línea(s) guardada(s). Descartadas por motivo:`, result.excluded);
  } catch (error) {
    if (error instanceof ErpSalesUnreachableError || error instanceof ErpSalesCredentialsMissingError || error instanceof ErpSalesTimeoutError) {
      console.error(`\n⚠ ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Error sincronizando ventas ERP:', error);
  process.exitCode = 1;
});
