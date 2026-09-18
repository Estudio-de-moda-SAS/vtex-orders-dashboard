import { BadRequestException } from '@nestjs/common';
import { IsISO8601, IsNotEmpty } from 'class-validator';

/**
 * DTO de entrada para GET /api/orders/dashboard.
 * Valida que las fechas existan, sean fechas ISO 8601 válidas y que
 * la fecha inicial no sea posterior a la fecha final.
 */
export class OrdersQueryDto {
  @IsNotEmpty({ message: 'startDate es obligatorio' })
  @IsISO8601({}, { message: 'startDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  startDate!: string;

  @IsNotEmpty({ message: 'endDate es obligatorio' })
  @IsISO8601({}, { message: 'endDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  endDate!: string;

  /**
   * Valida la coherencia entre las dos fechas. Se invoca explícitamente
   * desde el controller luego de la validación estructural de class-validator.
   */
  static assertRange(startDate: string, endDate: string): void {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('startDate/endDate no son fechas válidas');
    }

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate no puede ser posterior a endDate');
    }
  }
}
