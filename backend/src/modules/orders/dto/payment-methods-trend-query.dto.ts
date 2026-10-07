import { IsIn, IsOptional } from 'class-validator';

import { ProductAnalyticsQueryDto } from './product-analytics-query.dto';

/**
 * DTO de entrada para GET /api/analytics/payment-methods-trend — igual
 * que `ProductAnalyticsQueryDto` (solo fechas), más un `storeId` OPCIONAL
 * para acotar la tendencia a una sola tienda (ej. "¿qué método funciona
 * mejor en Diesel?"). Sin `storeId`: todas las tiendas combinadas.
 */
export class PaymentMethodsTrendQueryDto extends ProductAnalyticsQueryDto {
  @IsOptional()
  @IsIn(['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'], {
    message: 'storeId debe ser una tienda válida',
  })
  storeId?: string;
}
