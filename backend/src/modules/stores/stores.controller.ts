import { Controller, Get } from '@nestjs/common';

import { StoresService, PublicStoreInfo } from './stores.service';

@Controller('api/stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  /**
   * GET /api/stores
   * Retorna la lista de tiendas configuradas (id, nombre, color) para que
   * el frontend pueda construir filtros y leyendas. Nunca incluye
   * credenciales de VTEX.
   */
  @Get()
  getStores(): PublicStoreInfo[] {
    return this.storesService.getPublicStores();
  }
}
