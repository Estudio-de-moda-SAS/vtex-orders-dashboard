import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { OrdersQueryDto } from '../dto/orders-query.dto';
import { DashboardResponse } from '../interfaces/dashboard.interface';
import { OrdersService } from '../services/orders.service';

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * GET /api/orders/dashboard?startDate=2026-06-01&endDate=2026-06-30
   *
   * Consulta consolidada de las seis tiendas para el rango de fechas
   * dado. Lectura SQL pura sobre los agregados diarios pre-calculados en
   * Supabase (`sales_daily*`) — este endpoint NUNCA llama a VTEX; la
   * frescura de los datos es la de la última corrida del cron
   * (`lastSyncedAt`/`lastSyncStatus` por tienda), no la del momento de la
   * consulta.
   */
  @Get('dashboard')
  async getDashboard(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: OrdersQueryDto,
  ): Promise<DashboardResponse> {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.ordersService.getDashboard(query.startDate, query.endDate);
  }
}
