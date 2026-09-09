import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentHypInvoice } from './edgeAgentStore.js';

test('Hyp invoice lists every selected cabin', () => {
  const invoice = agentHypInvoice({
    agent: { name: 'סוכן דמו' },
    extras: {
      cabin_parties: [
        { cabin_id: 'hill-1', name: 'צימר בגבעה 1', adults: 2, children: 2, crib: false },
        { cabin_id: 'hill-2', name: 'צימר בגבעה 2', adults: 2, children: 2, crib: true }
      ]
    },
    cabinIds: ['hill-1', 'hill-2'],
    depositIls: 680,
    startDate: '2026-09-01',
    endDate: '2026-09-03'
  });
  assert.match(invoice.productName, /צימר בגבעה 1/);
  assert.match(invoice.productName, /צימר בגבעה 2/);
  assert.equal(invoice.products.length, 2);
  assert.match(invoice.products[1].Description, /מיטת תינוק/);
  assert.equal(invoice.products[0].UnitCost + invoice.products[1].UnitCost, 680);
});

test('per-cabin deposit invoice charges the booker cabin only', () => {
  const invoice = agentHypInvoice({
    agent: { name: 'סוכן דמו' },
    extras: {
      pay_split: 'per_cabin',
      booker_cabin_id: 'hill-1',
      cabin_parties: [
        { cabin_id: 'hill-1', name: 'צימר בגבעה 1', adults: 2 },
        { cabin_id: 'hill-2', name: 'צימר בגבעה 2', adults: 2 }
      ]
    },
    cabinIds: ['hill-1', 'hill-2'],
    depositIls: 1800,
    startDate: '2026-09-01',
    endDate: '2026-09-03'
  });
  assert.equal(invoice.products.length, 1);
  assert.equal(invoice.products[0].UnitCost, 1800);
  assert.match(invoice.products[0].Description, /צימר בגבעה 1/);
});
