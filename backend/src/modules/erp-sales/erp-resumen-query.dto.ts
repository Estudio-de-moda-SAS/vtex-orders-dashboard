import { IsOptional, IsString } from 'class-validator';

import { OrdersQueryDto } from '../orders/dto/orders-query.dto';

/**
 * `GET /api/erp-sales/resumen` — filtros opcionales, cada uno un arreglo
 * JSON de strings (se decodifican con `parseFilterList`).
 */
export class ErpResumenQueryDto extends OrdersQueryDto {
  @IsOptional()
  @IsString()
  stores?: string;

  @IsOptional()
  @IsString()
  marcas?: string;

  @IsOptional()
  @IsString()
  tipos?: string;
}
