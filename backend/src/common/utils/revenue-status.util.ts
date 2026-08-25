import { RevenueStatusDefinition } from '../../config/revenue-status.config';
import { VtexOrder } from '../../modules/orders/interfaces/vtex-order.interface';
import { normalizeText } from './text-normalize.util';

/**
 * Determina si una orden cuenta para el total "contabilizado" del
 * dashboard, comparando tanto `status` (código) como `statusDescription`
 * (texto legible) contra la configuración de `revenue-status.config.ts`.
 * Ver ese archivo para la lista de estados incluidos y cómo ajustarlos.
 */
export function isRevenueStatus(order: VtexOrder, definitions: RevenueStatusDefinition[]): boolean {
  return matchRevenueStatusDefinition(order, definitions) !== undefined;
}

/**
 * Igual que `isRevenueStatus`, pero devuelve la definición específica que
 * hizo match (o `undefined` si ninguna aplica), para poder desglosar el
 * total "contabilizado" por estado (invoiced, payment-approved, etc.).
 */
export function matchRevenueStatusDefinition(
  order: VtexOrder,
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
