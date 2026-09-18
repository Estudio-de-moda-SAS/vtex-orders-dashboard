import { IsISO8601, IsNotEmpty } from 'class-validator';

import { OrdersQueryDto } from './orders-query.dto';

/**
 * DTO de entrada para los endpoints de `ProductAnalyticsController`. Solo
 * fechas — a diferencia de `OrdersQueryDto`, ningún endpoint de
 * analítica de producto recibe `storeId` como query param: todos
 * retornan el desglose de TODAS las tiendas de una sola vez (global +
 * por tienda), para que el frontend no tenga que hacer una llamada HTTP
 * por cada una de las 6 tiendas en cada carga de página.
 */
export class ProductAnalyticsQueryDto {
  @IsNotEmpty({ message: 'startDate es obligatorio' })
  @IsISO8601({}, { message: 'startDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  startDate!: string;

  @IsNotEmpty({ message: 'endDate es obligatorio' })
  @IsISO8601({}, { message: 'endDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  endDate!: string;

  /** Reutiliza la misma validación de coherencia de fechas que `OrdersQueryDto`. */
  static assertRange(startDate: string, endDate: string): void {
    OrdersQueryDto.assertRange(startDate, endDate);
  }
}
