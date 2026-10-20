import { describe, expect, it } from 'vitest';
import {
  choiceByReply,
  groundByScan,
  groundsBands,
  groundsCatalog,
  groundsFamily,
  withGroundStatus,
  normalizeGrounds
} from './priorityGrounds';

function rows(ids) {
  return ids.map((id) => ({ id }));
}

describe('groundsBands', () => {
  it('gives a complex one yard and one shared pool across its cabins', () => {
    const bands = groundsBands(rows(['k671', 'k673', 'k674', 'k675', 'k676', 'k677', 'k678', 'k679']));
    expect(bands[0].yard).toEqual({ span: 8, id: 'yard:nurit' });
    expect(bands[0].pool).toEqual({ span: 8, kind: 'shared', id: 'pool:nurit' });
    expect(bands.slice(1).every((band) => band.yard === null && band.pool === null)).toBe(true);
  });

  it('keeps a private pool on the cabin row and leaves a cabin without one empty', () => {
    const bands = groundsBands(rows(['k693', 'k694', 'k695']));
    expect(bands[0].yard).toEqual({ span: 3, id: 'yard:maya' });
    expect(bands[0].pool).toEqual({ span: 1, kind: 'private', id: 'pool:k693' });
    expect(bands[1].yard).toBeNull();
    expect(bands[1].pool).toEqual({ span: 1, kind: 'none', id: '' });
    expect(bands[2].pool).toEqual({ span: 1, kind: 'private', id: 'pool:k695' });
  });

  it('puts a private pool beside each cabin that has one', () => {
    const bands = groundsBands(rows(['k685', 'k686']));
    expect(bands[0].yard.span).toBe(2);
    expect(bands[0].pool.kind).toBe('private');
    expect(bands[1].pool).toEqual({ span: 1, kind: 'private', id: 'pool:k686' });
  });

  it('does not merge neighboring complexes', () => {
    const bands = groundsBands(rows(['k680', 'k681', 'k685', 'k686']));
    expect(groundsFamily('k680')).toBe('mool');
    expect(bands[0].yard.span).toBe(2);
    expect(bands[0].pool.kind).toBe('shared');
    expect(bands[2].yard.span).toBe(2);
    expect(bands[2].pool.kind).toBe('private');
  });

  it('keeps the villa in the same yard as the suites, with pools only on the suites', () => {
    const bands = groundsBands(rows(['mialis-villa', 'suite-1', 'suite-2']));
    expect(bands[0].yard.span).toBe(3);
    expect(bands[0].pool).toEqual({ span: 1, kind: 'none', id: '' });
    expect(bands[1].pool.kind).toBe('private');
    expect(bands[2].pool.kind).toBe('private');
  });

  it('recognizes a pool or yard scan and records who changed the status', () => {
    const pool = groundByScan('START_POOL_nurit');
    const yard = groundByScan('START_YARD_maya');
    const cabin = groundByScan('START_POOL_k693');
    expect(pool?.label).toBe('בריכה · בתי נורית');
    expect(yard?.id).toBe('yard:maya');
    expect(cabin?.id).toBe('pool:k693');
    expect(groundByScan('START_B1')).toBeNull();
    expect(choiceByReply('pool', '3')?.key).toBe('treat');
    expect(choiceByReply('yard', 'לניקיון')?.key).toBe('dirty');

    const assets = normalizeGrounds({});
    const next = withGroundStatus(assets, {
      id: 'pool:nurit',
      status: 'inspect',
      by: 'רני',
      at: '2026-10-20T10:00:00.000Z'
    });
    expect(next['pool:nurit'].status).toBe('inspect');
    expect(next['pool:nurit'].log).toEqual([
      { at: '2026-10-20T10:00:00.000Z', by: 'רני', from: 'ok', to: 'inspect' }
    ]);
    expect(groundsCatalog().some((asset) => asset.scan === 'START_POOL_k694')).toBe(false);
  });
});
