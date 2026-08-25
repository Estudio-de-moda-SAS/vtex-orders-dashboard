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
   * Consulta las seis tiendas VTEX configuradas para el rango de fechas
   * dado y retorna la información consolidada lista para el dashboard.
   * Internamente resuelve cada tienda combinando caché histórico local +
   * consulta en vivo de la ventana mutable (ver HistoricalSyncService).
   *
   * `forceRefresh=true` ignora el caché para el rango pedido y vuelve a
   * consultar VTEX incluso para días ya marcados como "cerrados".
   */
  @Get('dashboard')
  async getDashboard(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: OrdersQueryDto,
  ): Promise<DashboardResponse> {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.ordersService.getDashboard(query.startDate, query.endDate, query.forceRefresh ?? false);
  }
}
