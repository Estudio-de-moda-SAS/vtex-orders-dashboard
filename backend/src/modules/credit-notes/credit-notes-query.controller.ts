import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { OrdersQueryDto } from '../orders/dto/orders-query.dto';
import { CreditNotesQueryDto } from './credit-notes-query.dto';
import { CreditNotesQueryService } from './credit-notes-query.service';

/** Endpoint de lectura de notas crédito (pestaña "Notas crédito" de `/presupuesto`) — lectura SQL pura, nunca llama a la API del ERP en vivo. */
@Controller('api/credit-notes')
export class CreditNotesQueryController {
  constructor(private readonly creditNotesQueryService: CreditNotesQueryService) {}

  /** GET /api/credit-notes/summary?startDate&endDate&storeId */
  @Get('summary')
  getSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: CreditNotesQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.creditNotesQueryService.getSummary(query.startDate, query.endDate, query.storeId);
  }
}
