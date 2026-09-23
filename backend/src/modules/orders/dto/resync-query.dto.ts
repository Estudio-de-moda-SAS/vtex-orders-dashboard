import { BadRequestException } from '@nestjs/common';
import { Matches } from 'class-validator';

const DAY_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * DTO de entrada para POST /api/sync/resync — a diferencia de
 * `OrdersQueryDto` (que acepta ISO 8601 completo), acá solo se acepta
 * fecha sola (YYYY-MM-DD): `VtexSyncCronService.runBackfillForRange`
 * arma el horario Colombia (00:00/23:59:59) internamente, así que un
 * timestamp con hora sería ambiguo (¿se recalcula ese día completo o no?).
 */
export class ResyncQueryDto {
  @Matches(DAY_ONLY_REGEX, { message: 'startDate debe tener el formato YYYY-MM-DD' })
  startDate!: string;

  @Matches(DAY_ONLY_REGEX, { message: 'endDate debe tener el formato YYYY-MM-DD' })
  endDate!: string;

  static assertRange(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new BadRequestException('startDate no puede ser posterior a endDate');
    }
  }
}
