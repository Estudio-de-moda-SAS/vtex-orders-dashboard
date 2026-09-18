import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickSafeRow } from './row-picker';

const FORBIDDEN_COLUMNS = [
  'Client Name',
  'Client Last Name',
  'Client Document',
  'Email',
  'Phone',
  'Receiver Name',
  'Street',
  'Number',
  'Complement',
  'Neighborhood',
  'Postal Code',
  'Card First Digits',
  'Card Last Digits',
  'TransactionId',
  'PaymentId',
  'Authorization Id',
  'TID',
  'NSU',
  'Corporate Name',
  'Corporate Document',
];

test('pickSafeRow descarta TODAS las columnas sensibles, incluso si vienen en la fila cruda', () => {
  const rawRow: Record<string, unknown> = {
    Order: 'VPC-12345',
    'Creation Date': '2026-06-01 10:00:00-0500',
    Host: 'pilatos21.vtexcommercestable.com.br',
  };
  for (const forbidden of FORBIDDEN_COLUMNS) {
    rawRow[forbidden] = 'DATO_SENSIBLE_DE_PRUEBA';
  }

  const safe = pickSafeRow(rawRow);

  for (const forbidden of FORBIDDEN_COLUMNS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(safe, forbidden),
      false,
      `la columna sensible "${forbidden}" no debe aparecer en la fila guardada`,
    );
  }
  // Las columnas permitidas sí deben sobrevivir.
  assert.equal(safe.Order, 'VPC-12345');
  assert.equal(safe.Host, 'pilatos21.vtexcommercestable.com.br');
});

test('pickSafeRow ignora silenciosamente columnas desconocidas (no listadas ni como permitidas ni como prohibidas)', () => {
  const safe = pickSafeRow({ Order: '123', 'Una Columna Futura Desconocida': 'x' });
  assert.equal(Object.prototype.hasOwnProperty.call(safe, 'Una Columna Futura Desconocida'), false);
});
