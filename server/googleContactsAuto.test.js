import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncLock } from './googleContactsPlan.js';
import { createPhoneScheduler, startGoogleContactsAutoSync } from './googleContacts.js';

const owner = { id: 'owner', tenant_id: 't', business_id: 't' };

function harness(extra = {}) {
  return startGoogleContactsAutoSync({
    enabled: () => true,
    ready: async () => true,
    loadUser: async () => owner,
    lock: createSyncLock(),
    schedule: () => 1,
    every: () => 2,
    clearLater: () => {},
    log: () => {},
    ...extra
  });
}

test('auto sync waits one minute, then repeats every 15 minutes', () => {
  const delays = [];
  let queued = null;
  const sync = harness({
    schedule: (fn, delay) => {
      delays.push(delay);
      queued = fn;
      return 1;
    },
    every: (_fn, delay) => {
      delays.push(delay);
      return 2;
    }
  });
  assert.deepEqual(delays, [60 * 1000]);
  queued();
  assert.deepEqual(delays, [60 * 1000, 15 * 60 * 1000]);
  sync.stop();
});

test('a second auto sync does not start while the first is running', async () => {
  let active = 0;
  let max = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sync = harness({
    run: async () => {
      active += 1;
      max = Math.max(max, active);
      await gate;
      active -= 1;
      return {};
    }
  });
  const first = sync.tick();
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.equal(max, 1);
  const second = await sync.tick();
  assert.equal(second, 'busy');
  release();
  await first;
  sync.stop();
});

test('a Google 429 skips the next tick', async () => {
  let runs = 0;
  let clock = 1000;
  const sync = harness({
    now: () => clock,
    run: async () => {
      runs += 1;
      const error = new Error('GOOGLE_UNAVAILABLE');
      error.status = 429;
      throw error;
    }
  });
  assert.equal(await sync.tick(), 'error');
  assert.equal(await sync.tick(), 'wait');
  assert.equal(runs, 1);
  clock += 15 * 60 * 1000;
  assert.equal(await sync.tick(), 'error');
  assert.equal(runs, 2);
  sync.stop();
});

test('two phone edits within 30 seconds become one sync', async () => {
  const calls = [];
  let queued = null;
  const scheduler = createPhoneScheduler({
    delayMs: 30 * 1000,
    sync: async (_user, e164) => { calls.push(e164); },
    lock: createSyncLock(),
    setTimer: (fn, delay) => {
      queued = { fn, delay };
      return 7;
    },
    clearTimer: () => {}
  });
  scheduler.schedule(owner, '052-123-4567');
  scheduler.schedule(owner, '0521234567');
  assert.equal(scheduler.pending(), 1);
  assert.equal(queued.delay, 30 * 1000);
  await queued.fn();
  assert.deepEqual(calls, ['+972521234567']);
  assert.equal(scheduler.pending(), 0);
});
