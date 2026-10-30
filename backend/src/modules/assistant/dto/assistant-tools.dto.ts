import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

import { getStoresConfig } from '../../../config/stores.config';

const STORE_IDS = getStoresConfig().map((store) => store.id);
const DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const BREAKDOWN_TYPES = ['status', 'payment', 'city', 'category', 'brand', 'collection', 'discount_bucket', 'seller', 'marketplace'];

/** Input de `resolve_period` — la frase de fecha tal cual la identificó el modelo (ver `period-resolver.util.ts` para el vocabulario soportado). */
export class ResolvePeriodDto {
  @IsNotEmpty({ message: 'phrase es obligatorio' })
  @IsString()
  phrase!: string;
}

/** Input de `get_sales`. */
export class GetSalesDto {
  @IsIn(STORE_IDS, { message: `storeId debe ser una de: ${STORE_IDS.join(', ')}` })
  storeId!: string;

  @Matches(DAY_REGEX, { message: 'startDay debe tener formato YYYY-MM-DD' })
  startDay!: string;

  @Matches(DAY_REGEX, { message: 'endDay debe tener formato YYYY-MM-DD' })
  endDay!: string;

  @IsIn(BREAKDOWN_TYPES, { message: `breakdown debe ser una de: ${BREAKDOWN_TYPES.join(', ')}` })
  breakdown!: string;
}

/** Un período `{startDay, endDay}` — usado como objeto anidado en `compare_periods`. */
export class PeriodInputDto {
  @Matches(DAY_REGEX, { message: 'startDay debe tener formato YYYY-MM-DD' })
  startDay!: string;

  @Matches(DAY_REGEX, { message: 'endDay debe tener formato YYYY-MM-DD' })
  endDay!: string;
}

/** Input de `compare_periods`. */
export class ComparePeriodsDto {
  @IsIn(STORE_IDS, { message: `storeId debe ser una de: ${STORE_IDS.join(', ')}` })
  storeId!: string;

  @ValidateNested()
  @Type(() => PeriodInputDto)
  periodA!: PeriodInputDto;

  @ValidateNested()
  @Type(() => PeriodInputDto)
  periodB!: PeriodInputDto;

  @IsOptional()
  @IsIn(BREAKDOWN_TYPES, { message: `breakdown debe ser una de: ${BREAKDOWN_TYPES.join(', ')}` })
  breakdown?: string;
}

/** Input de `get_budget_vs_actual`. */
export class GetBudgetVsActualDto {
  @IsIn(STORE_IDS, { message: `storeId debe ser una de: ${STORE_IDS.join(', ')}` })
  storeId!: string;

  @Matches(DAY_REGEX, { message: 'startDay debe tener formato YYYY-MM-DD' })
  startDay!: string;

  @Matches(DAY_REGEX, { message: 'endDay debe tener formato YYYY-MM-DD' })
  endDay!: string;
}

/** Input de `get_smartsale_budget_vs_actual` — sin `storeId`: es el presupuesto del canal completo, no por tienda. */
export class GetSmartSaleBudgetVsActualDto {
  @Matches(DAY_REGEX, { message: 'startDay debe tener formato YYYY-MM-DD' })
  startDay!: string;

  @Matches(DAY_REGEX, { message: 'endDay debe tener formato YYYY-MM-DD' })
  endDay!: string;
}

/** Input de `get_credit_notes` — `storeId` opcional (sin él, todas las marcas). */
export class GetCreditNotesDto {
  @Matches(DAY_REGEX, { message: 'startDay debe tener formato YYYY-MM-DD' })
  startDay!: string;

  @Matches(DAY_REGEX, { message: 'endDay debe tener formato YYYY-MM-DD' })
  endDay!: string;

  @IsOptional()
  @IsIn(STORE_IDS, { message: `storeId debe ser una de: ${STORE_IDS.join(', ')}` })
  storeId?: string;
}

/** Input de `get_smartsale_sales` — `periodB` opcional, para pedir la comparación contra otro período en la misma llamada (mismo patrón que `compare_periods`/`get_diagnosis`). `storeId` opcional (sin él, combina las 6 tiendas). */
export class GetSmartSaleSalesDto {
  @ValidateNested()
  @Type(() => PeriodInputDto)
  periodA!: PeriodInputDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PeriodInputDto)
  periodB?: PeriodInputDto;

  @IsOptional()
  @IsIn(STORE_IDS, { message: `storeId debe ser una de: ${STORE_IDS.join(', ')}` })
  storeId?: string;
}

/** Input de `get_diagnosis` — reusa el mismo `PeriodInputDto` anidado que `compare_periods`. */
export class GetDiagnosisDto {
  @IsIn(STORE_IDS, { message: `storeId debe ser una de: ${STORE_IDS.join(', ')}` })
  storeId!: string;

  @ValidateNested()
  @Type(() => PeriodInputDto)
  periodA!: PeriodInputDto;

  @ValidateNested()
  @Type(() => PeriodInputDto)
  periodB!: PeriodInputDto;
}

const ANALYTICS_BREAKDOWN_TYPES = ['channel', 'device', 'landing_page', 'user_type', 'city', 'product', 'campaign'];

/** Input de `get_analytics` — `storeId` es OBLIGATORIO acá (a diferencia de `get_sales`): ninguna de las lecturas de GA tiene un "combinado de las 6 tiendas" ya resuelto en el código existente. */
export class GetAnalyticsDto {
  @IsIn(STORE_IDS, { message: `storeId debe ser una de: ${STORE_IDS.join(', ')}` })
  storeId!: string;

  @Matches(DAY_REGEX, { message: 'startDay debe tener formato YYYY-MM-DD' })
  startDay!: string;

  @Matches(DAY_REGEX, { message: 'endDay debe tener formato YYYY-MM-DD' })
  endDay!: string;

  @IsIn(ANALYTICS_BREAKDOWN_TYPES, { message: `breakdown debe ser una de: ${ANALYTICS_BREAKDOWN_TYPES.join(', ')}` })
  breakdown!: string;
}

/** Input de `search_campaign` — `storeId` opcional (sin él, todas las tiendas). */
export class SearchCampaignDto {
  @IsNotEmpty({ message: 'query es obligatorio' })
  @IsString()
  query!: string;

  @Matches(DAY_REGEX, { message: 'startDay debe tener formato YYYY-MM-DD' })
  startDay!: string;

  @Matches(DAY_REGEX, { message: 'endDay debe tener formato YYYY-MM-DD' })
  endDay!: string;

  @IsOptional()
  @IsIn(STORE_IDS, { message: `storeId debe ser una de: ${STORE_IDS.join(', ')}` })
  storeId?: string;
}

export { STORE_IDS, BREAKDOWN_TYPES, ANALYTICS_BREAKDOWN_TYPES };
