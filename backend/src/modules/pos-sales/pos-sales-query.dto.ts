import { IsIn, IsOptional } from 'class-validator';

import { OrdersQueryDto } from '../orders/dto/orders-query.dto';

/** DTO de entrada para `GET /api/pos-sales/summary` — mismo patrón que `CreditNotesQueryDto`. */
export class PosSalesQueryDto extends OrdersQueryDto {
  @IsOptional()
  @IsIn(['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'], { message: 'storeId debe ser una tienda válida' })
  storeId?: string;
}
