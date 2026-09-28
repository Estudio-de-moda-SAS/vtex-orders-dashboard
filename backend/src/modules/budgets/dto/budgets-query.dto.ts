import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

const STORE_IDS = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

/** DTO de entrada para GET /api/budgets. */
export class BudgetsQueryDto {
  @IsIn(STORE_IDS, { message: 'storeId debe ser una tienda válida' })
  storeId!: string;

  @Type(() => Number)
  @IsInt({ message: 'year debe ser un número entero' })
  @Min(2000, { message: 'year fuera de rango' })
  @Max(2100, { message: 'year fuera de rango' })
  year!: number;

  @Type(() => Number)
  @IsInt({ message: 'month debe ser un número entero' })
  @Min(1, { message: 'month debe estar entre 1 y 12' })
  @Max(12, { message: 'month debe estar entre 1 y 12' })
  month!: number;
}
