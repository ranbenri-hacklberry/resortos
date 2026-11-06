import { describe, expect, it } from 'vitest';
import { readApiJson } from './readApiJson.js';

function response(body, status = 200, type = 'application/json') {
  return new Response(body, {
    status,
    headers: { 'Content-Type': type }
  });
}

describe('readApiJson', () => {
  it('returns JSON objects from a successful API response', async () => {
    const data = await readApiJson(response(JSON.stringify({ rows: [{ direction: 'outbound' }] })));
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].direction).toBe('outbound');
  });

  it('does not treat an HTML 200 as an empty success', async () => {
    const html = response('<!DOCTYPE html><html><body>ResortOS</body></html>', 200, 'text/html');
    await expect(readApiJson(html)).rejects.toMatchObject({ message: 'COMMS_UNAVAILABLE', status: 200 });
  });

  it('surfaces API error codes', async () => {
    await expect(readApiJson(response(JSON.stringify({ error: 'UNAUTHORIZED' }), 401)))
      .rejects.toMatchObject({ message: 'UNAUTHORIZED', status: 401 });
  });
});
