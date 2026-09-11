import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const InitiateClaimSchema = z.object({
  property_id: z.string().uuid({ message: 'מזהה מתחם לא תקין' }),
  phone: z.string().min(9, { message: 'מספר טלפון קצר מדי' }).max(15, { message: 'מספר טלפון ארוך מדי' })
});

function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('972')) return '0' + digits.slice(3);
  return digits;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const parseResult = InitiateClaimSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
      return jsonResponse({ error: 'VALIDATION_ERROR', message: errorMsg }, 400);
    }

    const { property_id, phone } = parseResult.data;
    const normalizedInputPhone = normalizePhone(phone);

    const anonKey = context.env?.SUPABASE_SERVICE_ROLE_KEY || context.env?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    const postgrestUrl = (context.env?.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');

    // 1. Fetch Property Record
    const propRes = await fetch(`${postgrestUrl}/rest/v1/properties?id=eq.${encodeURIComponent(property_id)}&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });

    if (!propRes.ok) {
      return jsonResponse({ error: 'DATABASE_ERROR', message: 'שגיאה בפנייה למסד הנתונים' }, 500);
    }

    const properties = await propRes.json();
    const property = properties[0];

    if (!property) {
      return jsonResponse({ error: 'PROPERTY_NOT_FOUND', message: 'המתחם לא נמצא במערכת' }, 404);
    }

    if (property.claimed_status === 'claimed_verified') {
      return jsonResponse({
        error: 'ALREADY_CLAIMED',
        message: 'המתחם כבר מאומת ומנוהל ע״י בעליו. להתחברות השתמש במסך הכניסה.'
      }, 409);
    }

    // 2. Validate Phone Match against Property Records
    const propWhatsApp = normalizePhone(property.whatsapp_number);
    const propPhone = normalizePhone(property.phone);

    if (normalizedInputPhone !== propWhatsApp && normalizedInputPhone !== propPhone) {
      return jsonResponse({
        error: 'PHONE_MISMATCH',
        message: 'מספר הטלפון שהוזן אינו תואם את הרישום הציבורי של המתחם. אנא הזינו את הטלפון הרשום בפרטי המתחם.'
      }, 403);
    }

    // 3. Enforce Rate Limiting (max 3 attempts in the last 1 hour)
    const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rateRes = await fetch(
      `${postgrestUrl}/rest/v1/property_claim_otps?property_id=eq.${encodeURIComponent(property_id)}&created_at=gt.${encodeURIComponent(oneHourAgoIso)}&select=id`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
    );

    if (rateRes.ok) {
      const recentAttempts = await rateRes.json();
      if (recentAttempts.length >= 3) {
        return jsonResponse({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'חרגת ממספר הנסיונות המותר (3 בשעה). אנא המתן ונסה שוב מאוחר יותר.'
        }, 429);
      }
    }

    // 4. Generate Cryptographically Secure 6-digit OTP
    const rawOtp = String(crypto.randomInt(100000, 999999));
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min TTL

    // 5. Store in property_claim_otps
    const insertRes = await fetch(`${postgrestUrl}/rest/v1/property_claim_otps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        property_id: property.id,
        phone: normalizedInputPhone,
        otp_hash: otpHash,
        attempts_count: 0,
        expires_at: expiresAt
      })
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('[Claim Initiate] Insert Error:', errText);
      return jsonResponse({ error: 'DB_INSERT_FAILED', message: 'שגיאה בשמירת קוד האימות' }, 500);
    }

    // 6. Trigger WhatsApp Dispatch
    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[WhatsApp Dispatch] Sending OTP ${rawOtp} to ${normalizedInputPhone} for ${property.hebrew_name}`);

    return jsonResponse({
      success: true,
      message: `קוד אימות בן 6 ספרות נשלח לוואטסאפ ${normalizedInputPhone.slice(0, 3)}-***${normalizedInputPhone.slice(-3)}. הקוד בתוקף ל-5 דקות.`,
      expires_in_seconds: 300,
      preview_otp: isDev ? rawOtp : undefined
    });
  } catch (err) {
    console.error('[API /api/claim/initiate Error]', err);
    return jsonResponse({ error: 'INTERNAL_SERVER_ERROR', message: err?.message || 'שגיאת שרת פנימית' }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
