/**
 * Ops / Chloe tool definitions for stay checkout + guest notify.
 * Host-facing assistant — not the public guest portal.
 */

export const OPS_ASSISTANT_TOOLS = [
  {
    name: 'get_stay_status',
    description:
      'בודק האם האורח דיווח על עזיבה (צ׳ק-אאוט עצמי), שעת העזיבה וסטטוס נוכחות Wi‑Fi/חריגה. '
      + 'ניתן לפי booking_id או cabin_id (unit_id).',
    parameters: {
      type: 'object',
      properties: {
        booking_id: { type: 'string', description: 'מזהה הזמנה (אופציונלי אם יש cabin_id)' },
        cabin_id: { type: 'string', description: 'מזהה יחידה / בקתה' }
      }
    }
  },
  {
    name: 'send_guest_notification',
    description:
      'שולח SMS מאושר לאורח המזמין או מתזמן הודעה. השתמשי רק אחרי אישור מפורש מהמארח. '
      + 'ערוץ ברירת מחדל: sms.',
    parameters: {
      type: 'object',
      properties: {
        booking_id: { type: 'string' },
        message: { type: 'string', description: 'תוכן ההודעה בעברית' },
        channel: { type: 'string', enum: ['sms', 'whatsapp', 'internal'], default: 'sms' },
        template_id: {
          type: 'string',
          description: 'אופציונלי: gate | late_checkout | cleaning | checkout_reminder | farewell'
        }
      },
      required: ['booking_id']
    }
  }
];

export const OPS_CHECKOUT_PROMPT_ADDENDUM = `
צ׳ק-אאוט דיגיטלי (ResortOS):
- שעת צ׳ק-אאוט רגילה: 11:00 (שעון ישראל).
- אורחים יכולים לסמן עזיבה בדף האירוח המאובטח (/stay?token=...) החל מ-08:00 בבוקר יום העזיבה.
- כשאורח שואל על יציאה: הנחי אותו לבצע צ׳ק-אאוט בקליק אחד בדף האירוח מהשעה 08:00.
- אפשר לבדוק סטטוס עזיבה עם get_stay_status ולשלוח הודעה מאושרת עם send_guest_notification (רק אחרי אישור המארח).
- אל תחשפי טלפונים, סכומים או שמות משפחה בצ׳אט עם אורחים; מול המארח אפשר לדווח סטטוס תפעולי.
`.trim();

export async function callOpsTool(name, args, { baseUrl = '', token = '' } = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  if (name === 'get_stay_status') {
    const qs = new URLSearchParams();
    if (args?.booking_id) qs.set('booking_id', args.booking_id);
    if (args?.cabin_id) qs.set('cabin_id', args.cabin_id);
    const response = await fetch(`${baseUrl}/api/ops/stay-status?${qs}`, { headers });
    return response.json();
  }
  if (name === 'send_guest_notification') {
    const response = await fetch(`${baseUrl}/api/guest-comms/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        booking_id: args.booking_id,
        message: args.message,
        channel: args.channel || 'sms',
        template_id: args.template_id
      })
    });
    return response.json();
  }
  throw new Error(`UNKNOWN_TOOL:${name}`);
}
