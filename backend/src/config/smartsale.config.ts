/**
 * Vendedores del canal SmartSale — identificados por `utmiCampaign` en
 * `marketingData` del detalle de orden de VTEX (confirmado con datos
 * reales, ej. `"utmiCampaign": "1011397082"`). Lista genérica y editable
 * — agregar una persona nueva a futuro es solo sumar una entrada aquí,
 * sin tocar la lógica de negocio.
 */
export interface SmartSalePerson {
  /** Valor exacto de `marketingData.utmiCampaign`. */
  utmiCampaign: string;
  /** Nombre a mostrar en el dashboard. */
  name: string;
}

export function getSmartSalePeople(): SmartSalePerson[] {
  return [
    { utmiCampaign: '1017221355', name: 'Felipe Rengifo' },
    { utmiCampaign: '1011397082', name: 'Juana Pinilla' },
    { utmiCampaign: '1152716116', name: 'Andrea Idárraga' },
  ];
}

/** Todos los `utmiCampaign` válidos del canal SmartSale — usado para filtrar SQL (`utmi_campaign = ANY(...)`). */
export function getSmartSaleCampaignIds(): string[] {
  return getSmartSalePeople().map((p) => p.utmiCampaign);
}
