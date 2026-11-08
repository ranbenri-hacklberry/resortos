import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { autoPublishGuestPages, needsGuestPage } from './autoPublishGuestPages.js';

const base = { id: 'kin_690_1', unit_id: 'k690', check_in_date: '2026-11-10', check_out_date: '2026-11-11', checkout_token: 'tok_kin_690_1', booking_status: 'PENDING' };

describe('autoPublishGuestPages', () => {
  it('filters staff, cancelled, past and token-less rows', () => {
    assert.equal(needsGuestPage(base, '2026-11-08'), true);
    assert.equal(needsGuestPage({ ...base, unit_id: 'k678' }, '2026-11-08'), false);
    assert.equal(needsGuestPage({ ...base, booking_status: 'CANCELLED' }, '2026-11-08'), false);
    assert.equal(needsGuestPage({ ...base, check_out_date: '2026-11-01' }, '2026-11-08'), false);
    assert.equal(needsGuestPage({ ...base, checkout_token: '' }, '2026-11-08'), false);
  });
  it('publishes the stored row once per id and survives failures', async () => {
    const published = [];
    const res = await autoPublishGuestPages(
      [base, base, { ...base, id: 'kin_691_2', checkout_token: 'tok_kin_691_2' }],
      {
        today: '2026-11-08',
        load: async (ids) => ids.map((id) => ({ ...base, id, checkout_token: `tok_${id}`, stay: { from: 'db' } })),
        publish: async (row) => { if (row.id === 'kin_691_2') throw new Error('boom'); published.push(row); }
      }
    );
    assert.equal(res.attempted, 2); assert.equal(res.published, 1); assert.equal(res.failed, 1);
    assert.equal(published[0].stay.from, 'db');
  });
});
