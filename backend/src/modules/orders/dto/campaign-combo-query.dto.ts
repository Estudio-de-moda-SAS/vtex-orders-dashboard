import { BadRequestException } from '@nestjs/common';
import { IsISO8601, IsNotEmpty } from 'class-validator';

import { OrdersQueryDto } from './orders-query.dto';

/**
 * DTO de entrada para GET /api/analytics/campaign-combo-total.
 *
 * `campaigns` viaja como UN SOLO parámetro con un arreglo JSON codificado
 * (`?campaigns=%5B%22A%22%2C%22B%22%5D`, es decir `["A","B"]` con
 * `encodeURIComponent`) — se descartaron dos alternativas más obvias
 * porque ambas rompen con datos reales:
 * - Unir los nombres con `,`: varios nombres de campaña reales traen una
 *   coma dentro de sí mismos (ej. "BAZAR bermudas girbaud $69,900", por
 *   el precio), así que separar por `,` los parte en fragmentos que no
 *   coinciden con ningún nombre real (confirmado en producción: 458 en
 *   vez de las 463 órdenes reales de VTEX).
 * - Repetir el parámetro (`campaigns=A&campaigns=B`): Express usa `qs`
 *   para parsear query strings, que por defecto (`arrayLimit: 20`)
 *   convierte la lista en un OBJETO con índices como claves en vez de un
 *   arreglo cuando hay más de 20 valores repetidos — confirmado en
 *   producción con el filtro "bazar" (27 campañas reales en Pilatos).
 *
 * Un solo valor JSON no tiene ninguna de las dos limitaciones: no hay
 * delimitador que colisione con el contenido, y no hay conteo de
 * parámetros que pueda disparar el límite de `qs`.
 */
export class CampaignComboQueryDto {
  @IsNotEmpty({ message: 'startDate es obligatorio' })
  @IsISO8601({}, { message: 'startDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  startDate!: string;

  @IsNotEmpty({ message: 'endDate es obligatorio' })
  @IsISO8601({}, { message: 'endDate debe ser una fecha válida (YYYY-MM-DD o ISO 8601)' })
  endDate!: string;

  @IsNotEmpty({ message: 'campaigns es obligatorio (arreglo JSON de nombres de campaña)' })
  campaigns!: string;

  static assertRange(startDate: string, endDate: string): void {
    OrdersQueryDto.assertRange(startDate, endDate);
  }

  /** Decodifica y valida `campaigns` como un arreglo de nombres no vacíos. */
  parseCampaigns(): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.campaigns);
    } catch {
      throw new BadRequestException('campaigns debe ser un arreglo JSON válido de nombres de campaña, ej. ["A","B"]');
    }
    if (!Array.isArray(parsed) || !parsed.every((c) => typeof c === 'string')) {
      throw new BadRequestException('campaigns debe ser un arreglo JSON de strings');
    }
    const names = parsed.map((c) => c.trim()).filter(Boolean);
    if (names.length === 0) {
      throw new BadRequestException('campaigns debe traer al menos un nombre de campaña no vacío');
    }
    return names;
  }
}
