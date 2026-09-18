import { RevenueStatusDefinition } from '../../config/revenue-status.config';
import { normalizeText } from './text-normalize.util';

/**
 * Cualquier cosa con `status`/`statusDescription` de VTEX — no
 * necesariamente una `VtexOrder` completa. Permite reutilizar esta lógica
 * también sobre filas de `order_items` combinadas con el status de su
 * orden (ver `OrderItemsRepository.getItemsWithOrderStatus`), sin tener
 * que reconstruir un objeto `VtexOrder` completo solo para poder llamar
 * esta función.
 */
export interface StatusLike {
  status: string | null | undefined;
  statusDescription?: string | null;
}

/**
 * Determina si una orden cuenta para el total "contabilizado" del
 * dashboard, comparando tanto `status` (código) como `statusDescription`
 * (texto legible) contra la configuración de `revenue-status.config.ts`.
 * Ver ese archivo para la lista de estados incluidos y cómo ajustarlos.
 */
export function isRevenueStatus(order: StatusLike, definitions: RevenueStatusDefinition[]): boolean {
  return matchRevenueStatusDefinition(order, definitions) !== undefined;
}

/**
 * Igual que `isRevenueStatus`, pero devuelve la definición específica que
 * hizo match (o `undefined` si ninguna aplica), para poder desglosar el
 * total "contabilizado" por estado (invoiced, payment-approved, etc.).
 */
export function matchRevenueStatusDefinition(
  order: StatusLike,
  definitions: RevenueStatusDefinition[],
): RevenueStatusDefinition | undefined {
  const normalizedStatus = normalizeText(order.status);
  const normalizedDescription = normalizeText(order.statusDescription);

  return definitions.find((definition) => {
    const matchesStatus = definition.statusMatchers.some(
      (matcher) => normalizeText(matcher) === normalizedStatus,
    );
    const matchesDescription =
      normalizedDescription.length > 0 &&
      definition.descriptionMatchers.some((matcher) =>
        normalizedDescription.includes(normalizeText(matcher)),
      );
    return matchesStatus || matchesDescription;
  });
}
