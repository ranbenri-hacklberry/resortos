import { readSharedTracker, writeSharedTracker } from './sharedTracker.js';

const loginAttempts = new Map();

function supabaseUrl() {
  return (process.env.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function supabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

function bearerToken(req) {
  const header = String(req.get('authorization') || '');
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : '';
}

function clientKey(req, username) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${ip}:${String(username || '').toLowerCase()}`;
}

function allowLoginAttempt(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 8) return false;
  entry.count += 1;
  return true;
}

async function rpc(fn, args) {
  const key = supabaseAnonKey();
  if (!key) {
    const err = new Error('Supabase anon key is not configured');
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const err = new Error((data && data.message) || response.statusText);
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

function mapStaffError(payload, res) {
  const code = payload?.error;
  if (code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
  if (code === 'USERNAME_TAKEN') return res.status(409).json({ error: 'USERNAME_TAKEN' });
  if (code === 'WEAK_PASSWORD') return res.status(400).json({ error: 'WEAK_PASSWORD' });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
  return res.status(400).json({ error: code || 'INVALID' });
}

function sendError(res, err) {
  const status = Number(err.status) || 500;
  if (status >= 500) console.error('[auth]', err);
  res.status(status).json({ error: status >= 500 ? 'AUTH_FAILED' : (err.message || 'AUTH_FAILED') });
}

export async function loginStaff(req, res) {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ error: 'INVALID' });
    }
    const key = clientKey(req, username);
    if (!allowLoginAttempt(key)) {
      return res.status(429).json({ error: 'RATE_LIMIT' });
    }
    const result = await rpc('hotelos_login', {
      p_username: username,
      p_password: password
    });
    if (!result || !result.token || !result.user) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    loginAttempts.delete(key);
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getStaffMe(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const user = await rpc('hotelos_me', { p_token: token });
    if (!user || !user.id) return res.status(401).json({ error: 'UNAUTHORIZED' });
    return res.json({ user });
  } catch (err) {
    return sendError(res, err);
  }
}

async function staffFromRequest(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const user = await rpc('hotelos_me', { p_token: token });
  if (!user?.id) return null;
  return user;
}

function canManageAgents(user) {
  return user?.role === 'MANAGER' || user?.role === 'OPS_MANAGER';
}

export async function listAgents(req, res) {
  try {
    const user = await staffFromRequest(req);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (!canManageAgents(user)) return res.status(403).json({ error: 'FORBIDDEN' });
    try {
      const listed = await rpc('hotelos_list_agents', { p_token: bearerToken(req) });
      if (!listed?.error && Array.isArray(listed?.agents)) {
        let rows = listed.agents;
        if (user.role !== 'MANAGER') rows = rows.filter((row) => row.staff_id === user.id);
        return res.json({ agents: rows });
      }
    } catch {
      /* fall through */
    }
    const { loadAgents, publicAgent } = await import('./agentAccounts.js');
    let rows = (await loadAgents()).map(publicAgent).filter(Boolean);
    if (user.role !== 'MANAGER') {
      rows = rows.filter((row) => row.staff_id === user.id);
    }
    return res.json({ agents: rows });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function upsertAgent(req, res) {
  try {
    const user = await staffFromRequest(req);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (!canManageAgents(user)) return res.status(403).json({ error: 'FORBIDDEN' });
    const { upsertResortAgent } = await import('./agentAccounts.js');
    let staffId = req.body?.staff_id ? String(req.body.staff_id) : '';
    if (user.role !== 'MANAGER') {
      staffId = user.id;
    }
    const agent = await upsertResortAgent({
      id: req.body?.id || '',
      name: req.body?.name || user.display_name,
      phone: req.body?.phone,
      pin: req.body?.pin,
      commissionRate: staffId ? 0 : req.body?.commission_rate,
      staffId: staffId || '',
      isActive: req.body?.is_active !== false
    });
    return res.json({ agent, pin: String(req.body?.pin || '').replace(/\D/g, '').slice(0, 4) || null });
  } catch (err) {
    if (err.message === 'PHONE_TAKEN') return res.status(409).json({ error: 'PHONE_TAKEN' });
    if (err.message === 'WEAK_PIN') return res.status(400).json({ error: 'WEAK_PIN' });
    if (err.message === 'INVALID') return res.status(400).json({ error: 'INVALID' });
    if (err.message === 'AGENT_PIN_MISSING') return res.status(503).json({ error: 'AGENT_PIN_MISSING' });
    return sendError(res, err);
  }
}

export async function deactivateAgent(req, res) {
  try {
    const user = await staffFromRequest(req);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (user.role !== 'MANAGER') return res.status(403).json({ error: 'FORBIDDEN' });
    const { deactivateResortAgent } = await import('./agentAccounts.js');
    await deactivateResortAgent(String(req.params?.id || req.body?.id || ''));
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function requireStaff(req, res, next) {
  try {
    const user = await staffFromRequest(req);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    req.staffUser = user;
    next();
  } catch (err) {
    return sendError(res, err);
  }
}

export async function requireManagerStaff(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const user = await rpc('hotelos_me', { p_token: token });
    if (!user || !user.id) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (user.role !== 'MANAGER') return res.status(403).json({ error: 'FORBIDDEN' });
    req.staffUser = user;
    next();
  } catch (err) {
    return sendError(res, err);
  }
}

export async function logoutStaff(req, res) {
  try {
    const token = bearerToken(req);
    if (token) await rpc('hotelos_logout', { p_token: token });
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function revealStaffPassword(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const result = await rpc('hotelos_reveal_staff_password', {
      p_token: token,
      p_staff_id: String(req.params?.id || '')
    });
    if (result?.error) return mapStaffError(result, res);
    return res.json({
      stored: result?.stored === true,
      password: result?.password || null
    });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function listStaff(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const result = await rpc('hotelos_list_staff', { p_token: token });
    if (result?.error) return mapStaffError(result, res);
    return res.json({ staff: Array.isArray(result?.staff) ? result.staff : [] });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function createStaff(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const result = await rpc('hotelos_create_staff', {
      p_token: token,
      p_username: String(req.body?.username || ''),
      p_password: String(req.body?.password || ''),
      p_display_name: String(req.body?.display_name || ''),
      p_role: String(req.body?.role || ''),
      p_allow_remote_attendance: req.body?.allow_remote_attendance === true,
      p_allowed_units: Array.isArray(req.body?.allowed_units) ? req.body.allowed_units : []
    });
    if (result?.error) return mapStaffError(result, res);
    if (!result?.user) return res.status(500).json({ error: 'AUTH_FAILED' });
    import('./guestContext.js').then((mod) => mod.scheduleGuestContextPush()).catch(() => {});
    return res.status(201).json(result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function updateStaff(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const result = await rpc('hotelos_update_staff', {
      p_token: token,
      p_staff_id: String(req.params?.id || ''),
      p_username: String(req.body?.username || ''),
      p_password: String(req.body?.password || ''),
      p_display_name: String(req.body?.display_name || ''),
      p_role: String(req.body?.role || ''),
      p_allow_remote_attendance: req.body?.allow_remote_attendance === true
        ? true
        : (req.body?.allow_remote_attendance === false ? false : null),
      p_allowed_units: Array.isArray(req.body?.allowed_units) ? req.body.allowed_units : null
    });
    if (result?.error) return mapStaffError(result, res);
    if (!result?.user) return res.status(500).json({ error: 'AUTH_FAILED' });
    import('./guestContext.js').then((mod) => mod.scheduleGuestContextPush()).catch(() => {});
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getAttendanceSettings(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const result = await rpc('hotelos_get_attendance_settings', { p_token: token });
    if (result?.error) return mapStaffError(result, res);
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function setAttendanceSettings(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const result = await rpc('hotelos_set_attendance_settings', {
      p_token: token,
      p_latitude: Number(req.body?.latitude),
      p_longitude: Number(req.body?.longitude),
      p_radius_meters: Number(req.body?.radius_meters || 150),
      p_site_label: String(req.body?.site_label || '')
    });
    if (result?.error) return mapStaffError(result, res);
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function deactivateStaff(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const staffId = String(req.params?.id || req.body?.id || '');
    const result = await rpc('hotelos_deactivate_staff', {
      p_token: token,
      p_staff_id: staffId
    });
    if (result?.error) return mapStaffError(result, res);
    import('./guestContext.js').then((mod) => mod.scheduleGuestContextPush()).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getSharedTrackerDoc(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const user = await rpc('hotelos_me', { p_token: token });
    if (!user?.id) return res.status(401).json({ error: 'UNAUTHORIZED' });
    return res.json(readSharedTracker());
  } catch (err) {
    return sendError(res, err);
  }
}

export async function saveSharedTrackerDoc(req, res) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const user = await rpc('hotelos_me', { p_token: token });
    if (!user?.id) return res.status(401).json({ error: 'UNAUTHORIZED' });
    return res.json(writeSharedTracker(req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}
