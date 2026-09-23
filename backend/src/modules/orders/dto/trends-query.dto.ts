import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO de entrada para GET /api/analytics/trends. A diferencia de los
 * demás endpoints de analítica (que reciben `startDate`/`endDate`
 * libres), acá se elige un AÑO + un rango de meses opcional (por
 * defecto: "año corrido", de enero al mes actual si `year` es el año en
 * curso, o a diciembre si es un año ya cerrado) — el backend calcula
 * automáticamente el mismo tramo del año anterior para comparar.
 * `startMonth === endMonth` aísla UN solo mes (ej. "solo agosto") en vez
 * del acumulado del año.
 */
export class TrendsQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'year debe ser un número entero' })
  @Min(2020, { message: 'year fuera de rango' })
  @Max(2100, { message: 'year fuera de rango' })
  year!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'startMonth debe ser un número entero' })
  @Min(1, { message: 'startMonth debe estar entre 1 y 12' })
  @Max(12, { message: 'startMonth debe estar entre 1 y 12' })
  startMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'endMonth debe ser un número entero' })
  @Min(1, { message: 'endMonth debe estar entre 1 y 12' })
  @Max(12, { message: 'endMonth debe estar entre 1 y 12' })
  endMonth?: number;

  @IsOptional()
  @IsIn(['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'], {
    message: 'storeId debe ser una tienda válida',
  })
  storeId?: string;
}
