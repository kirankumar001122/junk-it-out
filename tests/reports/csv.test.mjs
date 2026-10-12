import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toSafeCsvCell } from '../../lib/reports/csv.ts';

test('CSV cells quote delimiters and escape formulas after leading whitespace/control characters', () => {
  assert.equal(toSafeCsvCell('plain, value'), '"plain, value"');
  assert.equal(toSafeCsvCell('say "hello"'), '"say ""hello"""');
  for (const formula of ['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd', '\t=1+1', '\r@SUM(1)']) {
    assert.equal(toSafeCsvCell(formula), `"'${formula}"`);
  }
});
