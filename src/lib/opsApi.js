import { getStoredToken } from './staffAuth';

async function opsFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(12000)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { error: text }; }
  }
  if (!response.ok) {
    const err = new Error(data?.error || response.statusText);
    err.status = response.status;
    throw err;
  }
  return data;
}

export function listUnitOperations() {
  return opsFetch('/api/ops/units').then((data) => data?.units || []);
}

export function listBookings(query = {}) {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const qs = params.toString();
  return opsFetch(`/api/ops/bookings${qs ? `?${qs}` : ''}`).then((data) => data?.bookings || []);
}

export function saveUnitOperation(unitId, row) {
  return opsFetch(`/api/ops/units/${encodeURIComponent(unitId)}`, {
    method: 'PUT',
    body: JSON.stringify(row || {})
  }).then((data) => data?.unit || null);
}

export function listWorkLog() {
  return opsFetch('/api/ops/work-log').then((data) => data?.rows || []);
}

export function listUnitCatalog() {
  return opsFetch('/api/ops/catalog').then((data) => data?.units || []);
}

export function listSopTemplates() {
  return opsFetch('/api/ops/sop-templates').then((data) => data?.templates || []);
}

export function saveSopTemplate(template) {
  return opsFetch('/api/ops/sop-templates', {
    method: 'PUT',
    body: JSON.stringify({
      id: template?.id,
      domain: template?.domain,
      title: template?.title || {},
      steps: Array.isArray(template?.steps) ? template.steps : []
    })
  }).then((data) => data?.template || null);
}

function takeSseFrames(buffer, onEvent) {
  const frames = buffer.split('\n\n');
  const rest = frames.pop() || '';
  for (const frame of frames) {
    let event = 'message';
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    try {
      onEvent(event, JSON.parse(dataLines.join('\n')));
    } catch (_) {}
  }
  return rest;
}

/** Edge-filtered event stream. The browser does not choose the tenant or the unit list. */
export function subscribeOpsEvents(handlers = {}) {
  const controller = new AbortController();
  let stopped = false;

  async function run() {
    let buffer = '';
    while (!stopped) {
      try {
        const headers = { Accept: 'text/event-stream' };
        const token = getStoredToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch('/api/ops/events', { headers, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error('OPS_EVENTS_FAILED');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer = takeSseFrames(buffer + decoder.decode(value, { stream: true }), (event, data) => {
            if (event === 'unit' && handlers.onUnit) handlers.onUnit(data);
            if (event === 'booking' && handlers.onBooking) handlers.onBooking(data);
          });
        }
      } catch (err) {
        if (stopped || err?.name === 'AbortError') return;
      }
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  void run();
  return () => {
    stopped = true;
    controller.abort();
  };
}
