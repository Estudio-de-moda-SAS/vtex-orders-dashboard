/**
 * Umbrales del semáforo de `/resumen` — distinto del semáforo simple de
 * `/tendencias`/`/pilatos` (`growth-thresholds.config.ts`): acá el
 * verde/amarillo/rojo depende de qué tan inusual es la variación de
 * ventas PARA ESA TIENDA (umbral ensanchado por su propia variación
 * histórica, ver `resumen-semaphore.util.ts`), no de un % fijo igual
 * para todas. Valores INICIALES a validar con datos reales, no
 * definitivos — único lugar donde viven, igual patrón que
 * `growth-thresholds.config.ts`/`revenue-status.config.ts`.
 */
export interface ResumenSemaphoreConfig {
  /** Piso de la zona roja (%) cuando no hay suficiente historial propio o la variación histórica es muy baja. */
  floorRedPercent: number;
  /** Piso de la zona verde (%), mismo criterio que `floorRedPercent`. */
  floorGreenPercent: number;
  /** Multiplicador de la variación habitual (σ) de la tienda para ensanchar los límites rojo/verde. */
  k: number;
  /**
   * Órdenes contabilizadas mínimas en A y en B para que el semáforo
   * opine — por debajo, resultado "gris" por volumen insuficiente. A
   * diferencia de `floorRedPercent`/`floorGreenPercent`, este mínimo NO
   * es un número fijo: se calcula por tienda a partir de su propia
   * mediana histórica de órdenes (ver `computeMinOrdersThreshold`), para
   * que una tienda chica no quede gris todo el tiempo solo por ser
   * chica, ni una tienda grande se libre de un gris real por una caída
   * de volumen que a otra tienda no le diría nada.
   */
  minOrdersFloor: number;
  /** Mínimo cuando no hay suficiente historial propio de órdenes para sacar una mediana confiable (ver `minHistoryWindowsForOrders`). */
  minOrdersDefault: number;
  /** Fracción de la mediana histórica propia de la tienda exigida como mínimo (0,3 = 30% de lo habitual para esa tienda). */
  minOrdersRelativeFraction: number;
  /** Ventanas con órdenes mínimas para confiar en la mediana en vez de caer a `minOrdersDefault`. */
  minHistoryWindowsForOrders: number;
  /** Cambios consecutivos mínimos en el historial propio para usarlo como fuente de los límites (si no, se usan los valores por defecto `floorRedPercent`/`floorGreenPercent`). */
  minHistoryChanges: number;
  /** Tope de ventanas históricas consecutivas (hacia atrás desde B, excluyendo A) a construir. */
  maxHistoryWindows: number;
}

export function getResumenSemaphoreConfig(): ResumenSemaphoreConfig {
  return {
    floorRedPercent: 5,
    floorGreenPercent: 10,
    k: 1.5,
    minOrdersFloor: 10,
    minOrdersDefault: 30,
    minOrdersRelativeFraction: 0.3,
    minHistoryWindowsForOrders: 3,
    minHistoryChanges: 6,
    maxHistoryWindows: 13,
  };
}
