import { describe, expect, it, vi } from 'vitest';
import { buildPrompt, grokInvoiceLines, parseGrokJson } from './grokFallback.js';

const targets = [{ line_no: 1, sku: '123', latin: 'TP', qty: 2, unit_price: 10 }];

describe('grok invoice fallback', () => {
  it('builds a prompt listing only the asked lines', () => {
    expect(buildPrompt(targets)).toContain('sku "123"');
  });
  it('parses only known SKUs and keeps our SKU', () => {
    const m = parseGrokJson('x {"lines":[{"line_no":1,"sku":"999","name":"נייר טואלט"},{"line_no":5,"sku":"777","name":"זר"}]} y', targets);
    expect(m.size).toBe(1);
    expect(m.get('123')?.name).toBe('נייר טואלט');
  });
  it('returns null without a key and never calls the network', async () => {
    const f = vi.fn();
    expect(await grokInvoiceLines({ apiKey: '', fetchImpl: f as any }, Buffer.from('x'), 'image/jpeg', targets)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('uses the injected fetch (mock) and parses the reply', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ model: 'm', choices: [{ message: { content: '{"lines":[{"sku":"123","name":"סבון"}]}' } }] })));
    const r = await grokInvoiceLines({ apiKey: 'test', fetchImpl: f as any }, Buffer.from('x'), 'image/png', targets);
    expect(r?.lines.get('123')?.name).toBe('סבון');
  });
});
