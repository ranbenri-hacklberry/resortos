import test from 'node:test';
import assert from 'node:assert/strict';
import { callerSeesUnit } from './callMe.js';

const staff = [
  { name: 'ברק', phones: ['0515262609'], allowed_units: ['k680', 'k693'] },
  { name: 'רני', phones: ['0500000001'], allowed_units: [] },
];
const barak = { id: 'barak', name: 'ברק', phones: ['972515262609'] };
const rani = { id: 'rani', name: 'רני', phones: ['972500000001'] };

test('Barak (Ramot-only) gets Ramot calls, not others', async () => {
  assert.equal(await callerSeesUnit(barak, 'k693', staff), true);
  assert.equal(await callerSeesUnit(barak, 'mialis-villa', staff), false);
});
test('empty allowed_units and unknown unit = everything', async () => {
  assert.equal(await callerSeesUnit(rani, 'mialis-villa', staff), true);
  assert.equal(await callerSeesUnit(barak, '', staff), true);
});
