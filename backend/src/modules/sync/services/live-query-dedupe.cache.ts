import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
  promise: Promise<T>;
  expiresAt: number;
}

/**
 * Evita repetir la MISMA consulta en vivo a VTEX (misma tienda, misma
 * fuente, misma ventana de fechas) cuando llega en un lapso corto de
 * tiempo — por ejemplo, si varias personas abren el dashboard casi al
 * mismo tiempo, o si una persona refresca la página varias veces.
 *
 * En vez de que cada petición dispare su propia llamada a VTEX, todas las
 * que llegan mientras la primera sigue en curso (o durante los segundos
 * siguientes a que terminó) reciben el MISMO resultado, sin generar
 * tráfico adicional hacia VTEX. Esto es puramente una optimización de
 * volumen de peticiones — no reemplaza al caché histórico (SQLite) ni
 * afecta la exactitud: cada resultado cacheado aquí sigue siendo la
 * respuesta real y completa de VTEX en el momento en que se pidió, solo
 * que se reutiliza por unos segundos en vez de volver a pedirla.
 */
@Injectable()
export class LiveQueryDedupeCache {
  private readonly logger = new Logger(LiveQueryDedupeCache.name);
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  /**
   * Ejecuta `fn()` y cachea su promesa por `ttlMs`. Si ya hay una entrada
   * vigente (en curso o recién completada) para la misma `key`, retorna
   * esa misma promesa en vez de invocar `fn()` de nuevo.
   */
  async dedupe<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (existing && existing.expiresAt > now) {
      this.logger.debug(`Reutilizando consulta en vivo reciente para: ${key}`);
      return existing.promise as Promise<T>;
    }

    const promise = fn();
    this.entries.set(key, { promise, expiresAt: now + ttlMs });

    // Si la consulta falla, no tiene sentido seguir "cacheando" un
    // rechazo durante todo el TTL — se limpia de inmediato para que el
    // siguiente intento (o el botón de reintentar) dispare una consulta
    // fresca en vez de recibir el mismo error de caché.
    promise.catch(() => {
      const current = this.entries.get(key);
      if (current?.promise === promise) this.entries.delete(key);
    });

    return promise;
  }
}
