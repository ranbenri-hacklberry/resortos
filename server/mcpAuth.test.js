import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryOauthStore, createOauthService, s256 } from './mcpAuth.js';

function service(users, now = () => new Date('2026-10-23T06:00:00Z')) {
  return createOauthService({
    store: createMemoryOauthStore(),
    now,
    loopback: true,
    verifyStaff: async (username) => users[username] || null
  });
}

const manager = { id: 'daniel', username: 'daniel', role: 'MANAGER', display_name: 'דניאל', tenant_id: 't', is_active: true };

test('only a manager can be issued a code', async () => {
  const oauth = service({
    daniel: manager,
    house: { id: 'h', username: 'house', role: 'HOUSEKEEPING', is_active: true }
  });
  const client = oauth.register({ redirectUris: ['http://127.0.0.1/callback'], name: 'grok' });
  await assert.rejects(
    () => oauth.issueCode({
      clientId: client.id,
      redirectUri: 'http://127.0.0.1/callback',
      codeChallenge: s256('verifier-verifier-verifier-verifier'),
      method: 'S256',
      username: 'house',
      password: 'secret'
    }),
    /FORBIDDEN/
  );
});

test('pkce exchange then revoke', async () => {
  const oauth = service({ daniel: manager });
  const client = oauth.register({ redirectUris: ['https://grok.com/callback'], name: 'grok' });
  const verifier = 'verifier-verifier-verifier-verifier';
  const code = await oauth.issueCode({
    clientId: client.id,
    redirectUri: 'https://grok.com/callback',
    codeChallenge: s256(verifier),
    method: 'S256',
    username: 'daniel',
    password: 'secret',
    resource: 'https://ops.example/mcp'
  });
  const issued = oauth.exchange({
    code,
    verifier,
    clientId: client.id,
    redirectUri: 'https://grok.com/callback',
    resource: 'https://ops.example/mcp'
  });
  assert.match(issued.access_token, /^ros_mcp_/);
  assert.equal(oauth.authenticate(issued.access_token, 'https://ops.example/mcp')?.id, 'daniel');
  assert.equal(oauth.authenticate(issued.access_token, 'https://other.example/mcp'), null);
  assert.equal(oauth.revoke(issued.access_token), true);
  assert.equal(oauth.authenticate(issued.access_token, 'https://ops.example/mcp'), null);
});

test('wrong verifier and reused code are rejected', async () => {
  const oauth = service({ daniel: manager });
  const client = oauth.register({ redirectUris: ['https://chatgpt.com/callback'], name: 'chatgpt' });
  const code = await oauth.issueCode({
    clientId: client.id,
    redirectUri: 'https://chatgpt.com/callback',
    codeChallenge: s256('verifier-verifier-verifier-verifier'),
    method: 'S256',
    username: 'daniel',
    password: 'secret'
  });
  assert.throws(() => oauth.exchange({
    code,
    verifier: 'wrong-wrong-wrong-wrong-wrong-wrong',
    clientId: client.id,
    redirectUri: 'https://chatgpt.com/callback'
  }), /INVALID_GRANT/);
  assert.throws(() => oauth.exchange({
    code,
    verifier: 'verifier-verifier-verifier-verifier',
    clientId: client.id,
    redirectUri: 'https://chatgpt.com/callback'
  }), /INVALID_GRANT/);
});
