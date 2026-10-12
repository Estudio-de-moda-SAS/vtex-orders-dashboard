/**
 * Credenciales de la cuenta de servicio de Google Analytics —
 * `GA_SERVICE_ACCOUNT_JSON` puede venir como JSON crudo (empieza con
 * `{`) o en base64 (para evitar problemas de escapado de comillas/saltos
 * de línea en algunos proveedores de hosting). Esta función NUNCA debe
 * loguear `raw` ni el resultado parseado, ni incluirlos en un mensaje de
 * error — son credenciales reales de una cuenta de Google.
 */
export interface GaServiceAccountCredentials {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

export function parseGaServiceAccountJson(raw: string): GaServiceAccountCredentials {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // No se incluye `raw`/`jsonText` en el mensaje: evita que una credencial mal formada termine en un log o en Sentry.
    throw new Error('GA_SERVICE_ACCOUNT_JSON no es un JSON válido (ni crudo ni en base64).');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).client_email !== 'string' ||
    typeof (parsed as Record<string, unknown>).private_key !== 'string'
  ) {
    throw new Error('GA_SERVICE_ACCOUNT_JSON no tiene la forma esperada de una cuenta de servicio (faltan client_email/private_key).');
  }

  return parsed as GaServiceAccountCredentials;
}
