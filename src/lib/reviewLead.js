const LEAD_KEY = 'whastar-lead';
const DEMO_PLACE_KEY = 'whastar-demo-place';

export function readLead() {
  try {
    return JSON.parse(sessionStorage.getItem(LEAD_KEY) || 'null') || {};
  } catch (_) {
    return {};
  }
}

export function writeLead(lead) {
  sessionStorage.setItem(LEAD_KEY, JSON.stringify(lead || {}));
}

export function readDemoPlace() {
  try {
    return JSON.parse(sessionStorage.getItem(DEMO_PLACE_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

export function writeDemoPlace(place) {
  if (!place) sessionStorage.removeItem(DEMO_PLACE_KEY);
  else sessionStorage.setItem(DEMO_PLACE_KEY, JSON.stringify(place));
}
