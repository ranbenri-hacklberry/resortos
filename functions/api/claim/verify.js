import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const VerifyClaimSchema = z.object({
  property_id: z.string().min(1, { message: 'מזהה מתחם לא תקין' }),
  phone: z.string().min(9, { message: 'מספר טלפון קצר מדי' }).max(20, { message: 'מספר טלפון ארוך מדי' }),
  otp: z.string().length(6, { message: 'קוד אימות חייב להכיל 6 ספרות' }),
  full_name: z.string().min(2, { message: 'שם מלא חייב להכיל לפחות 2 תווים' }).optional(),
  email: z.string().email({ message: 'כתובת אימייל לא תקינה' }).optional()
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
    const parseResult = VerifyClaimSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
      return jsonResponse({ error: 'VALIDATION_ERROR', message: errorMsg }, 400);
    }

    const { property_id, phone, otp, full_name, email } = parseResult.data;
    const normalizedPhone = normalizePhone(phone);

    const anonKey = context.env?.SUPABASE_SERVICE_ROLE_KEY || context.env?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    const postgrestUrl = (context.env?.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');

    // 1. Fetch latest active OTP record for property & phone
    const nowIso = new Date().toISOString();
    const otpQuery = `${postgrestUrl}/rest/v1/property_claim_otps?property_id=eq.${encodeURIComponent(property_id)}&phone=eq.${encodeURIComponent(normalizedPhone)}&verified_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}&order=created_at.desc&limit=1`;
    
    const otpRes = await fetch(otpQuery, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });

    if (!otpRes.ok) {
      return jsonResponse({ error: 'DATABASE_ERROR', message: 'שגיאה באחזור קוד האימות' }, 500);
    }

    const otpRecords = await otpRes.json();
    const activeOtpRecord = otpRecords[0];

    if (!activeOtpRecord) {
      return jsonResponse({
        error: 'OTP_EXPIRED_OR_NOT_FOUND',
        message: 'קוד האימות פג תוקף או שאינו קיים. אנא בקש קוד חדש.'
      }, 400);
    }

    if (activeOtpRecord.attempts_count >= 5) {
      return jsonResponse({
        error: 'TOO_MANY_ATTEMPTS',
        message: 'הוזנו יותר מדי נסיונות שגויים. קוד זה נפסל, אנא בקש קוד חדש.'
      }, 429);
    }

    // 2. Validate OTP using bcrypt
    const isMatch = await bcrypt.compare(otp, activeOtpRecord.otp_hash);

    if (!isMatch) {
      // Increment attempt counter
      await fetch(`${postgrestUrl}/rest/v1/property_claim_otps?id=eq.${activeOtpRecord.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`
        },
        body: JSON.stringify({ attempts_count: activeOtpRecord.attempts_count + 1 })
      });

      return jsonResponse({
        error: 'INVALID_OTP',
        message: `קוד האימות שגוי. נותרו ${4 - activeOtpRecord.attempts_count} נסיונות.`
      }, 401);
    }

    // 3. Mark OTP as verified
    await fetch(`${postgrestUrl}/rest/v1/property_claim_otps?id=eq.${activeOtpRecord.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      },
      body: JSON.stringify({ verified_at: nowIso })
    });

    // 4. Fetch Property Details
    const propRes = await fetch(`${postgrestUrl}/rest/v1/properties?id=eq.${encodeURIComponent(property_id)}&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });
    const properties = await propRes.json();
    const property = properties[0];

    if (!property) {
      return jsonResponse({ error: 'PROPERTY_NOT_FOUND', message: 'המתחם לא נמצא' }, 404);
    }

    // 5. Provision / Find Profile
    let hostProfile = null;
    const profileQuery = await fetch(`${postgrestUrl}/rest/v1/profiles?phone=eq.${encodeURIComponent(normalizedPhone)}&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });

    if (profileQuery.ok) {
      const existing = await profileQuery.json();
      hostProfile = existing[0] || null;
    }

    if (!hostProfile) {
      const newProfileRes = await fetch(`${postgrestUrl}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          phone: normalizedPhone,
          full_name: full_name || property.name,
          email: email || property.email || `host_${normalizedPhone}@resortos.app`,
          role: 'host'
        })
      });

      if (newProfileRes.ok) {
        const createdProfiles = await newProfileRes.json();
        hostProfile = createdProfiles[0];
      }
    }

    const profileId = hostProfile?.id || property.id;

    // 6. Provision / Find Host Entity
    let hostRecord = null;
    const hostQuery = await fetch(`${postgrestUrl}/rest/v1/hosts?profile_id=eq.${encodeURIComponent(profileId)}&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });

    if (hostQuery.ok) {
      const existingHosts = await hostQuery.json();
      hostRecord = existingHosts[0] || null;
    }

    if (!hostRecord) {
      const newHostRes = await fetch(`${postgrestUrl}/rest/v1/hosts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          profile_id: profileId,
          business_name: property.hebrew_name || property.name,
          subscription_tier: 'free_directory',
          is_verified: true
        })
      });

      if (newHostRes.ok) {
        const createdHosts = await newHostRes.json();
        hostRecord = createdHosts[0];
      }
    }

    // 7. Transition Property to 'claimed_verified'
    await fetch(`${postgrestUrl}/rest/v1/properties?id=eq.${encodeURIComponent(property.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      },
      body: JSON.stringify({
        claimed_status: 'claimed_verified',
        crm_status: 'Portal_Free_Active',
        is_public: true,
        host_id: hostRecord ? hostRecord.id : null,
        direct_booking_enabled: true
      })
    });

    // 8. Generate Authenticated Session Token
    const sessionToken = `ros_${crypto.randomBytes(32).toString('hex')}`;
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    return jsonResponse({
      success: true,
      message: `המתחם ${property.hebrew_name} אומת בהצלחה! ברוך הבא ל-ResortOS.`,
      property: {
        id: property.id,
        slug: property.slug,
        name: property.hebrew_name,
        village: property.village,
        claimed_status: 'claimed_verified'
      },
      host: {
        id: hostRecord?.id || null,
        subscription_tier: hostRecord?.subscription_tier || 'free_directory',
        is_verified: true
      },
      session: {
        token: sessionToken,
        expires_at: sessionExpiresAt,
        phone: normalizedPhone
      }
    });
  } catch (err) {
    console.error('[API /api/claim/verify Error]', err);
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
