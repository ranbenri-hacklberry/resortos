import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPages, loadBookings } from './mcpData.js';

const manager = {
  id: 'manager',
  role: 'MANAGER',
  is_active: true,
  tenant_id: '22222222-2222-2222-2222-222222222222'
};

function json(data) {
  return { ok: true, text: async () => JSON.stringify(data) };
}

function rows(count, unitId = 'k1') {
  return Array.from({ length: count }, (_, index) => ({ id: `b${index}`, unit_id: unitId }));
}

test('pages one thousand bookings until a short page and stays complete', async () => {
  const calls = [];
  const loaded = await collectPages(async (offset, pageSize) => {
    calls.push({ offset, pageSize });
    if (offset < 2000) return rows(pageSize);
    return rows(41);
  });
  assert.deepEqual(calls, [
    { offset: 0, pageSize: 1000 },
    { offset: 1000, pageSize: 1000 },
    { offset: 2000, pageSize: 1000 }
  ]);
  assert.equal(loaded.rows.length, 2041);
  assert.equal(loaded.truncated, false);
});

test('a read is incomplete only when paging stops on a full page', async () => {
  const loaded = await collectPages(async () => rows(1000), { maxRows: 1000 });
  assert.equal(loaded.rows.length, 1000);
  assert.equal(loaded.truncated, true);
});

test('check-in bounds, property, and unit go into the booking query', async () => {
  const urls = [];
  const previous = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('resort_units')) {
      return json([
        { id: 'k1', property_id: 'kinorot' },
        { id: 'k2', property_id: 'kinorot' },
        { id: 'k3', property_id: 'other' }
      ]);
    }
    if (String(url).includes('unit_id=eq.k811')) return json([{ id: 'one', unit_id: 'k811' }]);
    const offset = Number(new URL(url).searchParams.get('offset') || 0);
    return json(offset === 0 ? rows(1000) : rows(1).map((row) => ({ ...row, id: 'last' })));
  };
  try {
    const byProperty = await loadBookings(manager, {
      from: '2026-02-01',
      to: '2026-02-28',
      property_id: 'kinorot'
    });
    const byUnit = await loadBookings(manager, { unit_id: 'k811', from: '2026-08-30', to: '2026-10-24' });
    assert.equal(byProperty.truncated, false);
    assert.equal(byProperty.rows.length, 1001);
    assert.equal(byUnit.rows.length, 1);
    const bookingUrls = urls.filter((url) => url.includes('hotelos_bookings'));
    assert.match(bookingUrls[0], /check_in_date=gte\.2026-02-01/);
    assert.match(bookingUrls[0], /check_in_date=lte\.2026-02-28/);
    assert.match(bookingUrls[0], /unit_id=in\.\(k1,k2\)/);
    assert.match(bookingUrls[0], /limit=1000&offset=0/);
    assert.match(bookingUrls[1], /offset=1000/);
    assert.equal(bookingUrls[0].includes('limit=2000'), false);
    assert.match(bookingUrls[2], /unit_id=eq\.k811/);
    assert.match(bookingUrls[2], /check_in_date=gte\.2026-08-30/);
    assert.match(bookingUrls[2], /check_in_date=lte\.2026-10-24/);
  } finally {
    global.fetch = previous;
    if (previousUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('february 2026 and the range through 24 Oct match the database', { skip: process.env.RESORTOS_LIVE_BOOKINGS !== '1' }, async () => {
  const february = await loadBookings(manager, { from: '2026-02-01', to: '2026-02-28' });
  const throughOctober = await loadBookings(manager, { from: '2026-08-30', to: '2026-10-24' });
  const yearThroughOctober = await loadBookings(manager, { from: '2026-01-01', to: '2026-10-24' });
  assert.equal(february.truncated, false);
  assert.equal(february.rows.length, 227);
  assert.equal(throughOctober.truncated, false);
  assert.equal(throughOctober.rows.length, 910);
  assert.equal(yearThroughOctober.truncated, false);
  assert.equal(yearThroughOctober.rows.length, 3041);
});
