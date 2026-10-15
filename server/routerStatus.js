import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function routerStatusPath() {
  return process.env.ROUTER_STATUS_PATH || path.join(__dirname, 'data', 'router-status.json');
}

export function readRouterStatus() {
  try {
    return JSON.parse(readFileSync(routerStatusPath(), 'utf8'));
  } catch {
    return null;
  }
}

export const ROUTER_ALERT_AFTER_MS = 5 * 60 * 1000;

export function alertForTransition(prev, next) {
  if (!prev) return null;
  const knewRouter = prev.routerReachable === true || prev.routerReachable === false;
  if (!knewRouter && typeof prev.internet !== 'boolean') return null;
  if (prev.routerReachable === true && next.routerReachable === false) return 'unreachable';
  if (prev.routerReachable === false && next.internet === true) return 'up';
  if (prev.routerReachable === false && next.internet === false) return 'down';
  if (prev.internet === true && next.internet === false) return 'down';
  if (prev.internet === false && next.internet === true) return 'up';
  return null;
}

export function routerLinkKind(status) {
  if (!status) return 'unknown';
  if (status.routerReachable === false) return 'unreachable';
  if (status.internet === false) return 'down';
  if (status.internet === true) return 'up';
  return 'unknown';
}

export function settleRouterAlert(prev, next, now = Date.now(), afterMs = ROUTER_ALERT_AFTER_MS) {
  const kind = routerLinkKind(next);
  const clear = { outageSince: null, outageKind: null, outageAlerted: false, alert: null };
  if (!prev) {
    if (kind === 'down' || kind === 'unreachable') {
      return { outageSince: new Date(now).toISOString(), outageKind: kind, outageAlerted: false, alert: null };
    }
    return clear;
  }
  if (kind === 'unknown') {
    return {
      outageSince: prev.outageSince || null,
      outageKind: prev.outageKind || null,
      outageAlerted: prev.outageAlerted === true,
      alert: null,
    };
  }
  if (kind === 'up') {
    return { ...clear, alert: prev.outageAlerted === true ? 'up' : null };
  }
  const since = Date.parse(prev.outageSince || '') || now;
  const alerted = prev.outageAlerted === true;
  if (!alerted && now - since >= afterMs) {
    return {
      outageSince: new Date(since).toISOString(),
      outageKind: kind,
      outageAlerted: true,
      alert: kind,
    };
  }
  return {
    outageSince: new Date(since).toISOString(),
    outageKind: kind,
    outageAlerted: alerted,
    alert: null,
  };
}

export function alertText(kind) {
  if (kind === 'down') return 'ResortOS משרד: אין אינטרנט בראוטר.';
  if (kind === 'up') return 'ResortOS משרד: האינטרנט בראוטר חזר.';
  if (kind === 'unreachable') return 'ResortOS משרד: אין קשר לראוטר.';
  return '';
}

export function publicRouterStatus(raw, now = Date.now()) {
  if (!raw) {
    return { ok: true, internet: null, routerReachable: false, stale: true, checkedAt: null };
  }
  const checked = Date.parse(raw.checkedAt || '');
  const stale = !Number.isFinite(checked) || now - checked > 90000;
  return {
    ok: true,
    internet: raw.internet === true ? true : (raw.internet === false ? false : null),
    routerReachable: raw.routerReachable === true,
    wwanUp: raw.wwanUp === true,
    wwanIp: raw.wwanIp || '',
    leases: Number(raw.leases) || 0,
    clients: Number(raw.clients) || 0,
    uptimeSec: Number(raw.uptimeSec) || 0,
    wwanUptimeSec: Number(raw.wwanUptimeSec) || 0,
    hostname: String(raw.hostname || ''),
    checkedAt: raw.checkedAt || null,
    stale,
  };
}

export function saveRouterReport(report, now = Date.now()) {
  const prev = readRouterStatus();
  const next = {
    internet: report.internet === true ? true : (report.internet === false ? false : null),
    routerReachable: report.routerReachable !== false && report.internet !== null,
    wwanUp: report.wwanUp === true,
    wwanIp: String(report.wwanIp || ''),
    leases: Number(report.leases) || 0,
    clients: Number(report.clients) || 0,
    uptimeSec: Number(report.uptimeSec) || 0,
    wwanUptimeSec: Number(report.wwanUptimeSec) || 0,
    hostname: String(report.hostname || '').replace(/[^\w.-]/g, '').slice(0, 40),
    checkedAt: new Date(now).toISOString(),
  };
  if (report.routerReachable === false) {
    next.routerReachable = false;
    next.internet = null;
  }
  const configured = Number(process.env.ROUTER_ALERT_AFTER_MS);
  const afterMs = Number.isFinite(configured) && configured >= 0 ? configured : ROUTER_ALERT_AFTER_MS;
  const settled = settleRouterAlert(prev, next, now, afterMs);
  next.outageSince = settled.outageSince;
  next.outageKind = settled.outageKind;
  next.outageAlerted = settled.outageAlerted;
  mkdirSync(path.dirname(routerStatusPath()), { recursive: true });
  writeFileSync(routerStatusPath(), JSON.stringify(next));
  return { status: publicRouterStatus(next, now), alert: settled.alert };
}
