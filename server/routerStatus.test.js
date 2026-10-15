import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { alertForTransition, alertText, publicRouterStatus, saveRouterReport } from './routerStatus.js';

test('internet loss and recovery produce one alert each', () => {
  assert.equal(alertForTransition(null, { internet: false, routerReachable: true }), null);
  assert.equal(alertForTransition({ internet: true, routerReachable: true }, { internet: false, routerReachable: true }), 'down');
  assert.equal(alertForTransition({ internet: false, routerReachable: true }, { internet: true, routerReachable: true }), 'up');
  assert.equal(alertForTransition({ internet: true, routerReachable: true }, { internet: null, routerReachable: false }), 'unreachable');
  assert.equal(alertForTransition({ internet: null, routerReachable: false }, { internet: true, routerReachable: true }), 'up');
  assert.match(alertText('down'), /אין אינטרנט/);
  assert.match(alertText('unreachable'), /משרד/);
});

test('a report is stored without printing secrets', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'router-status-'));
  process.env.ROUTER_STATUS_PATH = path.join(dir, 'status.json');
  const t0 = Date.parse('2026-10-13T12:00:00.000Z');
  const first = saveRouterReport({ internet: true, routerReachable: true, wwanUp: true, wwanIp: '192.168.68.55', leases: 4, clients: 0 }, t0);
  assert.equal(first.alert, null);
  assert.equal(first.status.internet, true);
  assert.equal(first.status.clients, 0);
  const blip = saveRouterReport({ internet: false, routerReachable: true, wwanUp: true, leases: 4 }, t0 + 30000);
  assert.equal(blip.alert, null);
  const back = saveRouterReport({ internet: true, routerReachable: true }, t0 + 60000);
  assert.equal(back.alert, null);
  saveRouterReport({ internet: false, routerReachable: true }, t0 + 120000);
  const early = saveRouterReport({ internet: false, routerReachable: true }, t0 + 120000 + 4 * 60 * 1000);
  assert.equal(early.alert, null);
  const held = saveRouterReport({ internet: false, routerReachable: true }, t0 + 120000 + 5 * 60 * 1000);
  assert.equal(held.alert, 'down');
  const again = saveRouterReport({ internet: false, routerReachable: true }, t0 + 120000 + 6 * 60 * 1000);
  assert.equal(again.alert, null);
  const recovered = saveRouterReport({ internet: true, routerReachable: true }, t0 + 120000 + 7 * 60 * 1000);
  assert.equal(recovered.alert, 'up');
  const shown = publicRouterStatus(held.status, t0 + 120000 + 5 * 60 * 1000);
  assert.equal(shown.internet, false);
  assert.equal(shown.stale, false);
  assert.equal(shown.outageSince, undefined);
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ROUTER_STATUS_PATH;
});
