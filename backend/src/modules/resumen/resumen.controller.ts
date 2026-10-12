import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { ResumenQueryDto } from './resumen-query.dto';
import { ResumenService } from './resumen.service';

/** `GET /api/analytics/summary` — semáforo de ventas + motor del cambio + mensaje automático, comparando dos rangos elegidos por el usuario. */
@Controller('api/analytics/summary')
export class ResumenController {
  constructor(private readonly resumenService: ResumenService) {}

  @Get()
  getSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: ResumenQueryDto) {
    ResumenQueryDto.assertRanges(query);
    return this.resumenService.getSummary(query.startDateA, query.endDateA, query.startDateB, query.endDateB);
  }
}
