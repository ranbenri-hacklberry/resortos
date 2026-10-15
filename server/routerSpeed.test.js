import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSpeedtest } from './routerSpeed.js';

test('parses the router speed test lines', () => {
  const parsed = parseSpeedtest(`
[21:30:49.665] idle ping avg 9.25 ms
[21:30:51.879] download average 31.79 Mbps
[21:30:59.100] upload average 8.40 Mbps
`);
  assert.equal(parsed.pingMs, 9.25);
  assert.equal(parsed.downMbps, 31.79);
  assert.equal(parsed.upMbps, 8.4);
});
