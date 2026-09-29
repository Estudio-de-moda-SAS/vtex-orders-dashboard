/**
 * Candado en memoria, uno por `key` — dos llamadas con la MISMA key nunca
 * corren a la vez (la segunda espera a que la primera termine, exitosa o
 * no); llamadas con keys distintas corren en paralelo sin esperarse.
 *
 * Existe específicamente para `SalesAggregatesRepository.replaceAggregates`
 * (borra + inserta un rango de días de UNA tienda): hay dos caminos que
 * pueden llamarlo para la MISMA tienda al mismo tiempo — el cron normal
 * (`VtexSyncCronService.runSyncForStore`) y el respaldo "en vivo" que
 * dispara el dashboard cuando encuentra un día sin sincronizar
 * (`fetchOnDemand`/`persistOnDemandResult`). Sin este candado, ambos
 * pueden intercalar su `DELETE`+`INSERT` para el mismo (tienda, día) y
 * terminar violando la llave primaria (`duplicate key value violates
 * unique constraint "sales_daily_pkey"`, confirmado en producción) — solo
 * el paso de ESCRITURA se serializa acá, no la consulta a VTEX (la parte
 * lenta), así que el respaldo del dashboard no se vuelve más lento por
 * esto en el caso normal (sin choque).
 *
 * Vive en memoria de ESTE proceso — no protege contra dos instancias
 * separadas del backend escribiendo a la vez (hoy corre como un solo
 * proceso; si eso cambiara, haría falta un candado a nivel de base de
 * datos, ej. `pg_advisory_lock`).
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    // Se registra el "final" de esta corrida (ignorando éxito/error) para
    // que la SIGUIENTE llamada con la misma key espere por esto, sin
    // quedar atascada para siempre si esta corrida termina en error.
    this.tails.set(
      key,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }
}
