import { IsISO8601, IsNotEmpty } from 'class-validator';

import { OrdersQueryDto } from './orders-query.dto';

/** DTO de entrada para los endpoints de `SmartSaleController` — mismo patrón que `ProductAnalyticsQueryDto`. */
export class SmartSaleQueryDto {
  @IsNotEmpty({ message: 'startDate es obligatorio' })
  @IsISO8601({}, { message: 'startDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  startDate!: string;

  @IsNotEmpty({ message: 'endDate es obligatorio' })
  @IsISO8601({}, { message: 'endDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  endDate!: string;

  static assertRange(startDate: string, endDate: string): void {
    OrdersQueryDto.assertRange(startDate, endDate);
  }
}
