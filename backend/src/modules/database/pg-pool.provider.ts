import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

const logger = new Logger('PgPool');

/**
 * `Pool` único de `pg` para toda la aplicación, apuntando al connection
 * string del POOLER de Supabase (modo Transaction, puerto 6543) en
 * `DATABASE_URL` — nunca el de conexión directa (puerto 5432), por la
 * cantidad de usuarios concurrentes esperados (~20). Ver
 * `backend/.env.example` para cómo obtener ese connection string.
 */
export const pgPoolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const connectionString = configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL no está configurada. Revisa backend/.env.');
    }
    const pool = new Pool({ connectionString });

    // CRÍTICO: sin este listener, cualquier error de un cliente IDLE del
    // pool (ej. el pooler de Supabase cerrando una conexión inactiva) se
    // emite como evento 'error' sin manejar — Node lo trata como excepción
    // no capturada y TUMBA TODO EL PROCESO, no solo la query que fallaba.
    // Con el listener, el pool simplemente descarta ese cliente y sigue
    // funcionando; la próxima query abre una conexión nueva.
    pool.on('error', (error) => {
      logger.error(`Error de fondo en el pool de Postgres (conexión inactiva descartada): ${error.message}`);
    });

    return pool;
  },
};
