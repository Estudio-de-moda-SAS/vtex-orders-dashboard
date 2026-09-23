import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { todayColombia } from '../../../common/utils/date-range.util';
import { TrendsQueryDto } from '../dto/trends-query.dto';
import { TrendsService } from '../services/trends.service';

/**
 * Endpoint del módulo `/tendencias` (comparativo año contra año). Lee
 * directamente `sales_daily_by_status` — nunca toca VTEX, igual que el
 * resto de la analítica.
 */
@Controller('api/analytics')
export class TrendsController {
  constructor(private readonly trendsService: TrendsService) {}

  /**
   * GET /api/analytics/trends?year=2026&startMonth=8&endMonth=8&storeId=pilatos
   *
   * `startMonth` por defecto es 1 (enero — "año corrido"). `endMonth` es
   * opcional: si se omite, es el mes actual (si `year` es el año en
   * curso) o diciembre (si `year` ya cerró). `startMonth === endMonth`
   * aísla un solo mes (ej. "solo agosto") para validar cuánto creció o
   * cayó ESE mes puntual, en vez del acumulado del año. `storeId` es
   * opcional: si se omite, `monthly` refleja la suma de las 6 tiendas
   * (`storeGrowth` siempre trae las 6, sin importar este filtro).
   */
  @Get('trends')
  getTrends(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: TrendsQueryDto,
  ) {
    const endMonth = query.endMonth ?? this.defaultEndMonth(query.year);
    const startMonth = query.startMonth ?? 1;
    return this.trendsService.getTrends(query.year, startMonth, endMonth, query.storeId);
  }

  private defaultEndMonth(year: number): number {
    const [todayYear, todayMonth] = todayColombia().split('-').map(Number);
    return year === todayYear ? todayMonth : 12;
  }
}
