import { requireManagerStaff } from './auth.js';
import {
  beginConnect,
  clearGoogleToken,
  finishConnect,
  googleContactsStatus,
  googleContactsSyncLock,
  runGoogleContactsSync,
  setGoogleContactsLive,
  startGoogleContactsAutoSync
} from './googleContacts.js';

function originOf(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

function queryOf(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function manager(req, res) {
  let user = null;
  let denied = false;
  const status = res.status.bind(res);
  res.status = (code) => {
    if (code === 401 || code === 403) denied = true;
    return status(code);
  };
  await requireManagerStaff(req, res, () => { user = req.staffUser; });
  return denied ? null : user;
}

export async function tryHandleGoogleContacts(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname;
  if (!path.startsWith('/api/google-contacts')) return false;
  if (!req.get) req.get = (name) => req.headers[String(name || '').toLowerCase()];

  if (req.method === 'GET' && path === '/api/google-contacts/callback') {
    try {
      const back = await finishConnect(queryOf(req));
      res.statusCode = 302;
      res.setHeader('Location', `${back}/?google_contacts=connected`);
      res.end();
    } catch {
      res.statusCode = 302;
      res.setHeader('Location', '/?google_contacts=failed');
      res.end();
    }
    return true;
  }

  const user = await manager(req, res);
  if (!user) return true;

  try {
    if (req.method === 'GET' && path === '/api/google-contacts/status') {
      send(res, 200, await googleContactsStatus(user));
      return true;
    }
    if (req.method === 'POST' && path === '/api/google-contacts/connect') {
      send(res, 200, { url: beginConnect(originOf(req)) });
      return true;
    }
    if (req.method === 'POST' && path === '/api/google-contacts/disconnect') {
      clearGoogleToken();
      send(res, 200, { connected: false });
      return true;
    }
    if (req.method === 'POST' && path === '/api/google-contacts/sync') {
      if (!googleContactsSyncLock.tryEnter()) {
        send(res, 409, { error: 'SYNC_BUSY' });
        return true;
      }
      try {
        const live = Boolean(req.body?.live);
        send(res, 200, await runGoogleContactsSync(user, { live }));
      } finally {
        googleContactsSyncLock.leave();
      }
      return true;
    }
    if (req.method === 'POST' && path === '/api/google-contacts/live') {
      send(res, 200, await setGoogleContactsLive(Boolean(req.body?.enabled)));
      return true;
    }
    send(res, 404, { error: 'NOT_FOUND' });
  } catch (err) {
    const status = Number(err.status) || 500;
    const code = status >= 500 ? (err.message || 'GOOGLE_CONTACTS_FAILED') : err.message;
    send(res, status, { error: code || 'GOOGLE_CONTACTS_FAILED' });
  }
  return true;
}

if (!process.env.NODE_TEST_CONTEXT) startGoogleContactsAutoSync();
