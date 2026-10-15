import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';

test('cool command posts temperature and off posts the power-off path', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'esp-ac-'));
  process.env.ESP_AC_STATE_PATH = path.join(dir, 'state.json');
  process.env.ESP_GATEWAY_URL = 'http://gateway.test';
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (String(url).endsWith('/api/status')) {
      return { ok: true, json: async () => ({ status: 'success', gateway: 'online' }) };
    }
    return { ok: true, json: async () => ({ status: 'success' }) };
  };

  const mod = await import(`./espClimate.js?t=${Date.now()}`);
  const original = mod.readEspAcState;
  // State file is fixed inside the module; drive commands through the public API
  // and assert only the HTTP calls. A missing state file reads as unknown.
  assert.equal(typeof original, 'function');

  const on = await mod.espClimateCommand({ target: 24 }, fetchImpl);
  assert.equal(on.ok, true);
  assert.equal(on.unit.power, true);
  assert.equal(on.unit.targetC, 24);
  assert.equal(on.unit.mode, 'cold');
  assert.deepEqual(
    calls.filter((call) => call.method === 'POST').map((call) => [call.url, call.body]),
    [['http://gateway.test/api/ir/ac', JSON.stringify({ temp: 24 })]],
  );

  const off = await mod.espClimateCommand({ power: false }, fetchImpl);
  assert.equal(off.unit.power, false);
  const posts = calls.filter((call) => call.method === 'POST');
  assert.equal(posts.at(-1).url, 'http://gateway.test/api/ir/ac/off');
  rmSync(dir, { recursive: true, force: true });
});

test('warm and a non-auto fan do not transmit', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'esp-ac-'));
  process.env.ESP_AC_STATE_PATH = path.join(dir, 'state.json');
  process.env.ESP_GATEWAY_URL = 'http://gateway.test';
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push(options.method || 'GET');
    return { ok: true, json: async () => ({ status: 'success', gateway: 'online' }) };
  };
  const mod = await import(`./espClimate.js?t=${Date.now()}-2`);
  const warm = await mod.espClimateCommand({ mode: 'warm' }, fetchImpl);
  const fan = await mod.espClimateCommand({ fan: 'high' }, fetchImpl);
  assert.equal(warm.ok, false);
  assert.equal(fan.ok, false);
  assert.deepEqual(calls.filter((method) => method === 'POST'), []);
  rmSync(dir, { recursive: true, force: true });
});

test('office pilot unlock posts to the lock and skips infrared', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'esp-ac-'));
  process.env.ESP_AC_STATE_PATH = path.join(dir, 'state.json');
  process.env.ESP_GATEWAY_URL = 'http://gateway.test';
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    return { ok: true, json: async () => ({ status: 'success', gateway: 'online' }) };
  };
  const mod = await import(`./espClimate.js?t=${Date.now()}-3`);
  const result = await mod.officePilotCommand({ action: 'unlock', operator: 'משרד' }, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'unlock');
  const posts = calls.filter((call) => call.method === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'http://gateway.test/api/unlock');
  assert.equal(posts[0].body, JSON.stringify({ operator: 'משרד' }));
  rmSync(dir, { recursive: true, force: true });
});
