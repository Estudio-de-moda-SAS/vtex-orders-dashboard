import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

const STORE_IDS = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

/** DTO de entrada para POST /api/budgets/bulk. */
export class BulkBudgetsDto {
  @IsIn(STORE_IDS, { message: 'storeId debe ser una tienda válida' })
  storeId!: string;

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

  @IsArray({ message: 'rawValues debe ser un arreglo de números' })
  @ArrayMinSize(1, { message: 'rawValues no puede venir vacío' })
  @IsNumber({}, { each: true, message: 'rawValues debe traer solo números' })
  rawValues!: number[];

  @IsOptional()
  @IsBoolean()
  confirmOverwrite?: boolean;
}
