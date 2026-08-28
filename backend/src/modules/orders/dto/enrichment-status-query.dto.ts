import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** DTO de entrada para GET /api/sync/enrichment-status. */
export class EnrichmentStatusQueryDto {
  @IsNotEmpty({ message: 'storeId es obligatorio' })
  @IsString()
  storeId!: string;

  /** Si se omiten (junto con `endDate`), el % es sobre todo el histórico cacheado de la tienda. */
  @IsOptional()
  @IsISO8601({}, { message: 'startDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  startDate?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'endDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  endDate?: string;
}
