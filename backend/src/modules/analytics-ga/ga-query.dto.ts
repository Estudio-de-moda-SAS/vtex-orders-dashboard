import { IsIn, IsOptional } from 'class-validator';

import { OrdersQueryDto } from '../orders/dto/orders-query.dto';

/** DTO de entrada para `GET /api/analytics/ga/*` — mismas fechas que `OrdersQueryDto`, `storeId` opcional (sin él, todas las tiendas). */
export class GaQueryDto extends OrdersQueryDto {
  @IsOptional()
  @IsIn(['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'], { message: 'storeId debe ser una tienda válida' })
  storeId?: string;
}
