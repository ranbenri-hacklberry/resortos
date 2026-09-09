import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { hashAgentPin, readAgentSession, signAgentSession } from '../../functions/lib/edgeAgentCrypto.js';

describe('edge agent crypto', () => {
  it('matches Node SHA-256 pin hashes used by Studio', async () => {
    const pepper = 'mailbox-secret';
    const edge = await hashAgentPin('050-000-0001', '2468', pepper);
    const node = `sha256:${createHash('sha256').update('mailbox-secret:0500000001:2468').digest('hex')}`;
    expect(edge).toBe(node);
  });

  it('signs and reads an HTTP session without leaking the pin', async () => {
    const token = await signAgentSession({ id: 'a1', name: 'יוסי', commission_rate: 0.1 }, 'sess', 60);
    const agent = await readAgentSession(token, 'sess');
    expect(agent).toEqual({ id: 'a1', name: 'יוסי', commission_rate: 0.1 });
    expect(await readAgentSession(token, 'other')).toBeNull();
  });
});
