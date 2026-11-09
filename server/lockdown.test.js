import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiOnlyLockdownPlugin } from '../vite.config.js';

describe('ops.resortos.app lockdown plugin', () => {
  it('blocks non-API routes on ops host or cloudflare tunnel with 404', () => {
    const plugin = apiOnlyLockdownPlugin({});
    let middleware = null;
    plugin.configureServer({
      middlewares: {
        use: (fn) => { middleware = fn; }
      }
    });

    const mockRes = () => {
      let statusCode = 200;
      let ended = false;
      let body = '';
      return {
        get statusCode() { return statusCode; },
        set statusCode(val) { statusCode = val; },
        setHeader() {},
        end(data) { ended = true; body = data; },
        get ended() { return ended; },
        get body() { return body; }
      };
    };

    // 1. Root / with Cloudflare header -> 404
    const res1 = mockRes();
    let nextCalled1 = false;
    middleware({ headers: { 'cf-ray': 'test-ray' }, url: '/' }, res1, () => { nextCalled1 = true; });
    assert.equal(res1.statusCode, 404);
    assert.equal(res1.body, 'Not Found');
    assert.equal(nextCalled1, false);

    // 2. /desk on ops.resortos.app -> 404
    const res2 = mockRes();
    let nextCalled2 = false;
    middleware({ headers: { host: 'ops.resortos.app' }, url: '/desk' }, res2, () => { nextCalled2 = true; });
    assert.equal(res2.statusCode, 404);
    assert.equal(res2.body, 'Not Found');
    assert.equal(nextCalled2, false);

    // 3. /dashboard with cf-connecting-ip -> 404
    const res3 = mockRes();
    let nextCalled3 = false;
    middleware({ headers: { 'cf-connecting-ip': '1.2.3.4' }, url: '/dashboard' }, res3, () => { nextCalled3 = true; });
    assert.equal(res3.statusCode, 404);
    assert.equal(res3.body, 'Not Found');
    assert.equal(nextCalled3, false);

    // 4. /guest with ops.resortos.app -> 404
    const res4 = mockRes();
    let nextCalled4 = false;
    middleware({ headers: { host: 'ops.resortos.app' }, url: '/guest' }, res4, () => { nextCalled4 = true; });
    assert.equal(res4.statusCode, 404);
    assert.equal(res4.body, 'Not Found');
    assert.equal(nextCalled4, false);

    // 5. /api/ops/units with Cloudflare header -> passes through
    const res5 = mockRes();
    let nextCalled5 = false;
    middleware({ headers: { 'cf-ray': 'test-ray' }, url: '/api/ops/units' }, res5, () => { nextCalled5 = true; });
    assert.equal(nextCalled5, true);
    assert.equal(res5.ended, false);

    // 6. /pg/rest/v1/hotelos_bookings with Cloudflare header -> passes through
    const res6 = mockRes();
    let nextCalled6 = false;
    middleware({ headers: { 'cf-ray': 'test-ray' }, url: '/pg/rest/v1/hotelos_bookings' }, res6, () => { nextCalled6 = true; });
    assert.equal(nextCalled6, true);
    assert.equal(res6.ended, false);

    // 7. Local non-ops request without LOCK_OPS_API_ONLY passes through (for local dev)
    const res7 = mockRes();
    let nextCalled7 = false;
    middleware({ headers: { host: 'localhost:5173' }, url: '/' }, res7, () => { nextCalled7 = true; });
    assert.equal(nextCalled7, true);
    assert.equal(res7.ended, false);
  });
});
