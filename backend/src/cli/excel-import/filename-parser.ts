import { StoreConfig, getStoresConfig } from '../../config/stores.config';

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export interface ParsedFileName {
  store: StoreConfig;
  startMonth: number;
  endMonth: number;
  year: number;
}

/**
 * Reconoce el patrón real de los archivos ("ordenes {tienda} {mes_inicio}
 * - {mes_fin} {año}", ej. "ordenes diesel enero - junio 2026") sin forzar
 * un renombrado. Retorna `null` (nunca lanza) si el nombre no matchea —
 * el llamador decide si reportarlo como error o simplemente ignorarlo.
 */
export function parseHistoricalFileName(fileName: string): ParsedFileName | null {
  const withoutExtension = fileName.replace(/\.(xlsx?|csv)$/i, '');
  const monthPattern = Object.keys(SPANISH_MONTHS).join('|');
  const regex = new RegExp(`^ordenes\\s+(\\w+)\\s+(${monthPattern})\\s*-\\s*(${monthPattern})\\s+(\\d{4})$`, 'i');
  const match = withoutExtension.trim().match(regex);
  if (!match) return null;

  const [, storeName, startMonthName, endMonthName, yearText] = match;
  const store = getStoresConfig().find((s) => s.name.toLowerCase() === storeName.toLowerCase());
  if (!store) return null;

  return {
    store,
    startMonth: SPANISH_MONTHS[startMonthName.toLowerCase()],
    endMonth: SPANISH_MONTHS[endMonthName.toLowerCase()],
    year: Number(yearText),
  };
}
