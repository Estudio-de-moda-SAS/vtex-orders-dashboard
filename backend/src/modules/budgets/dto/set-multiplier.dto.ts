import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

/** DTO de entrada para POST /api/budgets/multiplier. */
export class SetMultiplierDto {
  @IsInt({ message: 'year debe ser un número entero' })
  @Min(2000, { message: 'year fuera de rango' })
  @Max(2100, { message: 'year fuera de rango' })
  year!: number;

  @IsInt({ message: 'month debe ser un número entero' })
  @Min(1, { message: 'month debe estar entre 1 y 12' })
  @Max(12, { message: 'month debe estar entre 1 y 12' })
  month!: number;

  @IsNotEmpty({ message: 'code es obligatorio' })
  @IsString()
  code!: string;

  @IsNumber({}, { message: 'multiplier debe ser un número' })
  @IsPositive({ message: 'multiplier debe ser mayor que 0' })
  multiplier!: number;

  @IsOptional()
  @IsBoolean()
  confirmOverwrite?: boolean;
}
