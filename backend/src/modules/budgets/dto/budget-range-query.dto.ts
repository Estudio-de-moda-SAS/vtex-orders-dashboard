import { IsIn, IsISO8601, IsNotEmpty, IsOptional } from 'class-validator';

/** DTO de entrada para GET /api/budgets/range-summary. */
export class BudgetRangeQueryDto {
  @IsNotEmpty({ message: 'startDate es obligatorio' })
  @IsISO8601({}, { message: 'startDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  startDate!: string;

  @IsNotEmpty({ message: 'endDate es obligatorio' })
  @IsISO8601({}, { message: 'endDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  endDate!: string;

  /** `'vtex'` por defecto si no viene — ver migración 0025. */
  @IsOptional()
  @IsIn(['vtex', 'smartsale'], { message: 'channel debe ser "vtex" o "smartsale"' })
  channel?: string;
}
