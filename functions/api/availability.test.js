import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from './availability.js';

function stayDb(payload) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return { payload: JSON.stringify(payload) };
            }
          };
        }
      };
    }
  };
}

const blocked = [
  { unitId: 'k671', checkIn: '2026-10-31', checkOut: '2026-11-02', status: 'CONFIRMED' },
  { unitId: 'k672', checkIn: '2026-10-31', checkOut: '2026-11-02', status: 'CONFIRMED' }
];

test('availability filters by unit_id without throwing', async () => {
  const request = new Request('https://resortos.app/api/availability?from=2026-10-31&to=2026-11-02&unit_id=k672');
  const response = await onRequest({ request, env: { STAY_DB: stayDb({ blocked }) } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.unitId, 'k672');
  assert.equal(body.available, false);
  assert.equal(body.blockedRanges.length, 1);
  assert.equal(body.blockedRanges[0].unitId, 'k672');
});

test('availability without a unit returns every blocked range', async () => {
  const request = new Request('https://resortos.app/api/availability?from=2026-10-31&to=2026-11-02');
  const response = await onRequest({ request, env: { STAY_DB: stayDb({ blocked }) } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.unitId, 'all');
  assert.equal(body.blockedRanges.length, 2);
});
