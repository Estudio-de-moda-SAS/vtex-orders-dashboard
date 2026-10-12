import { IsISO8601, IsNotEmpty } from 'class-validator';

import { OrdersQueryDto } from '../orders/dto/orders-query.dto';

/**
 * DTO de entrada para `GET /api/analytics/summary` — a diferencia del
 * resto del dashboard (un solo rango, "B" se deriva automáticamente),
 * `/resumen` deja elegir LOS DOS rangos a comparar explícitamente.
 */
export class ResumenQueryDto {
  @IsNotEmpty({ message: 'startDateA es obligatorio' })
  @IsISO8601({}, { message: 'startDateA debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  startDateA!: string;

  @IsNotEmpty({ message: 'endDateA es obligatorio' })
  @IsISO8601({}, { message: 'endDateA debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  endDateA!: string;

  @IsNotEmpty({ message: 'startDateB es obligatorio' })
  @IsISO8601({}, { message: 'startDateB debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  startDateB!: string;

  @IsNotEmpty({ message: 'endDateB es obligatorio' })
  @IsISO8601({}, { message: 'endDateB debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  endDateB!: string;

  /** Valida cada rango por separado (reutiliza `OrdersQueryDto.assertRange`) — A y B pueden quedar en cualquier orden cronológico entre sí, eso no se valida acá. */
  static assertRanges(dto: ResumenQueryDto): void {
    OrdersQueryDto.assertRange(dto.startDateA, dto.endDateA);
    OrdersQueryDto.assertRange(dto.startDateB, dto.endDateB);
  }
}
