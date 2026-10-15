export const BEACON_ALERT_AFTER_MS = 60 * 1000;

export function beaconSmsText(name) {
  const clean = String(name || 'מכשיר').replace(/\s+/g, ' ').trim().slice(0, 40) || 'מכשיר';
  return `${clean} לא נמצא במשרד. תבדקו שהוא לא יצא מהחדר.`;
}

export function normalizeBeaconAssets(payload) {
  const rows = Array.isArray(payload?.assets) ? payload.assets : [];
  return rows.map((row) => {
    const rssi = Number(row?.rssi);
    const rawStatus = String(row?.status || '');
    const status = rawStatus === 'SUSPECT_OUTSIDE' || rawStatus === 'ALERT_MISSING' || rawStatus === 'SAFE'
      ? rawStatus
      : (row?.is_present === true ? 'SAFE' : 'ALERT_MISSING');
    const present = status !== 'ALERT_MISSING' && row?.is_present !== false;
    return {
      mac: String(row?.mac || '').trim().toLowerCase(),
      name: String(row?.name || 'ביקון').replace(/\s+/g, ' ').trim().slice(0, 40) || 'ביקון',
      rssi: Number.isFinite(rssi) ? rssi : null,
      lastSeenSec: Number.isFinite(Number(row?.last_seen_sec)) ? Number(row.last_seen_sec) : null,
      present,
      status,
    };
  }).filter((row) => row.mac);
}

export function applyBeaconSample(prev, sample, nowIso) {
  if (sample?.online !== true) {
    return {
      online: false,
      checkedAt: nowIso,
      assets: Array.isArray(prev?.assets) ? prev.assets : [],
      alerts: Array.isArray(prev?.alerts) ? prev.alerts : [],
      sms: [],
    };
  }
  const assets = normalizeBeaconAssets(sample);
  const hadBaseline = Array.isArray(prev?.assets);
  const prior = new Map((hadBaseline ? prev.assets : []).map((row) => [row.mac, row]));
  const open = new Map((Array.isArray(prev?.alerts) ? prev.alerts : [])
    .filter((row) => row && row.acked !== true && row.mac)
    .map((row) => [row.mac, row]));
  const alerts = [];
  const sms = [];
  const nowMs = Date.parse(nowIso) || Date.now();
  for (const asset of assets) {
    const before = prior.get(asset.mac);
    const existing = open.get(asset.mac);
    if (!asset.present && hadBaseline && (before?.present === true || before?.missingSince)) {
      asset.missingSince = before?.missingSince || nowIso;
      const elapsed = nowMs - Date.parse(asset.missingSince);
      if (elapsed >= BEACON_ALERT_AFTER_MS) {
        asset.alertedMissing = true;
        if (existing) alerts.push({ ...existing, name: asset.name, recovered: false });
        else if (before?.alertedMissing !== true) {
          alerts.push({
            id: `${asset.mac}:${Date.parse(nowIso) || Date.now()}`,
            mac: asset.mac,
            name: asset.name,
            at: nowIso,
            recovered: false,
          });
          sms.push(asset.name);
        }
      }
    } else if (!asset.present && existing) {
      asset.missingSince = before?.missingSince || existing.at || nowIso;
      asset.alertedMissing = true;
      alerts.push({ ...existing, name: asset.name, recovered: false });
    }
  }
  return { online: true, checkedAt: nowIso, assets, alerts, sms };
}

export function ackBeaconAlerts(state, ids) {
  const wanted = new Set((ids || []).map((id) => String(id)));
  return {
    ...(state || {}),
    alerts: (state?.alerts || []).filter((row) => !wanted.has(String(row?.id))),
  };
}

export function publicBeaconReport(state) {
  return {
    ok: true,
    online: state?.online === true,
    checkedAt: state?.checkedAt || null,
    assets: Array.isArray(state?.assets) ? state.assets : [],
    alerts: (Array.isArray(state?.alerts) ? state.alerts : [])
      .filter((row) => row && row.acked !== true)
      .map((row) => ({
        id: row.id,
        mac: row.mac,
        name: row.name,
        at: row.at,
        recovered: row.recovered === true,
      })),
  };
}

export function beaconLine(asset, online) {
  const name = asset?.name || 'ביקון';
  if (!online) return `${name} · אין קשר`;
  if (asset?.status === 'SUSPECT_OUTSIDE') {
    const rssi = Number.isFinite(Number(asset?.rssi)) ? ` ${asset.rssi}` : '';
    return `${name} · בחצר${rssi}`;
  }
  if (!asset?.present || asset?.status === 'ALERT_MISSING') return `${name} · לא נקלט`;
  const rssi = Number.isFinite(Number(asset?.rssi)) ? ` ${asset.rssi}` : '';
  return `${name} · נקלט${rssi}`;
}

export function beaconTone(asset, online) {
  if (!online) return 'offline';
  if (asset?.status === 'SUSPECT_OUTSIDE') return 'suspect';
  return asset?.present && asset?.status !== 'ALERT_MISSING' ? 'ok' : 'missing';
}
