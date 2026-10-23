import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFSET_AMOUNT_ILS, OFFSET_AMOUNT_AGOROT } from './offsetRule.js';

test('employee offset is always 500 ILS', () => {
  assert.equal(OFFSET_AMOUNT_ILS, 500);
  assert.equal(OFFSET_AMOUNT_AGOROT, 50000);
});
