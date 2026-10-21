/**
 * Staff / office operational questions (Ran 2026-10-20, bug 2): arrivals, occupancy, weekend load,
 * guest counts per room. These must never get the guest fallback + guest-page blurb.
 */
const OPS_RE = new RegExp([
  'מי\\s+(?:נכנס|נכנסים|מגיע|מגיעים|יוצא|יוצאים)',
  '(?:^|[^\\u0590-\\u05FF])[הוב]?כניסות(?:$|[^\\u0590-\\u05FF])',
  '(?:^|[^\\u0590-\\u05FF])[הוב]?יציאות(?:$|[^\\u0590-\\u05FF])',
  'תפוס(?:ה|ת)(?:$|[^\\u0590-\\u05FF])',
  'כמה\\s+(?:אורחים|אנשים)\\s+(?:יש|נמצאים|נכנסים|מגיעים)',
  'כמה\\s+(?:חדרים|יחידות|בקתות)\\s+(?:תפוסים|תפוסות|מושכרים|פנויים|פנויות)',
  '\\boccupancy\\b', '\\barrivals?\\b', 'who\\s+(?:is\\s+)?(?:checking\\s+in|arriving)',
].join('|'), 'iu');

const WEEKEND_RE = /סופ[״"']?ש|סוף\s+שבוע|weekend/i;
const WHO_OR_LOAD_RE = /מי|כמה|מה\s+המצב|תפוס|כניס/;

export function isStaffOpsQuestion(text?: string | null): boolean {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (OPS_RE.test(t)) return true;
  // "סופ״ש" alone can be a booking inquiry ("יש מקום בסופ״ש?"); only with who/how-many/occupancy words.
  return WEEKEND_RE.test(t) && WHO_OR_LOAD_RE.test(t) && !/מקום|פנוי|להזמין|מחיר|כמה עולה/.test(t);
}

export const STAFF_OPS_ONLY_REPLY =
  'זו שאלה תפעולית של הצוות 🙂 מידע על כניסות ותפוסה נמסר רק למנהלי המתחם ממספר מורשה.\n' +
  'אם אתם אורחים ויש לכם שאלה על השהות שלכם, כתבו לי אותה כאן.';
