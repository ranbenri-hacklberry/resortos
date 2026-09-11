import { z } from 'zod';

const PushGuideSchema = z.object({
  property_id: z.string().uuid({ message: 'מזהה מתחם לא תקין' }),
  unit_id: z.string().min(1, { message: 'מזהה יחידה לא תקין' }).max(64),
  guide_id: z.string().uuid({ message: 'מזהה מדריך לא תקין' }),
  custom_wifi_name: z.string().max(64).optional(),
  custom_wifi_password: z.string().max(64).optional(),
  custom_notes: z.string().max(500).optional(),
  avatar_override_url: z.string().url().optional()
});

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
    const parseResult = PushGuideSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
      return jsonResponse({ error: 'VALIDATION_ERROR', message: errorMsg }, 400);
    }

    const {
      property_id,
      unit_id,
      guide_id,
      custom_wifi_name,
      custom_wifi_password,
      custom_notes,
      avatar_override_url
    } = parseResult.data;

    const anonKey = context.env?.SUPABASE_SERVICE_ROLE_KEY || context.env?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    const postgrestUrl = (context.env?.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');

    // 1. Fetch the Guide Template
    const guideRes = await fetch(`${postgrestUrl}/rest/v1/articles_and_guides?id=eq.${encodeURIComponent(guide_id)}&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });

    if (!guideRes.ok) {
      return jsonResponse({ error: 'DB_ERROR', message: 'שגיאה בטעינת תבנית המדריך' }, 500);
    }

    const guides = await guideRes.json();
    const guide = guides[0];

    if (!guide) {
      return jsonResponse({ error: 'GUIDE_NOT_FOUND', message: 'תבנית המדריך המבוקשת לא נמצאה' }, 404);
    }

    // 2. Fetch Property & Unit Names
    const propRes = await fetch(`${postgrestUrl}/rest/v1/properties?id=eq.${encodeURIComponent(property_id)}&select=id,name,hebrew_name,village&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });
    const properties = await propRes.json();
    const property = properties[0];

    // 3. Upsert into host_room_guides
    const roomGuidePayload = {
      guide_id: guide.id,
      property_id,
      unit_id,
      custom_wifi_name: custom_wifi_name || null,
      custom_wifi_password: custom_wifi_password || null,
      custom_notes: custom_notes || null,
      avatar_override_url: avatar_override_url || null,
      is_active_on_room_tv: true,
      updated_at: new Date().toISOString()
    };

    // Check existing
    const existingGuideRes = await fetch(
      `${postgrestUrl}/rest/v1/host_room_guides?property_id=eq.${encodeURIComponent(property_id)}&unit_id=eq.${encodeURIComponent(unit_id)}&limit=1`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
    );

    const existingGuides = await existingGuideRes.json();
    if (existingGuides && existingGuides.length > 0) {
      await fetch(`${postgrestUrl}/rest/v1/host_room_guides?id=eq.${existingGuides[0].id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`
        },
        body: JSON.stringify(roomGuidePayload)
      });
    } else {
      await fetch(`${postgrestUrl}/rest/v1/host_room_guides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`
        },
        body: JSON.stringify(roomGuidePayload)
      });
    }

    // 4. Construct Realtime Payload for Room TV / Stay Portal
    const channelName = `resortos:room:${property_id}:${unit_id}`;
    const broadcastEvent = {
      event: 'ROOM_GUIDE_PUSHED',
      channel: channelName,
      property_id,
      property_name: property?.hebrew_name || property?.name || 'Resort',
      unit_id,
      guide: {
        id: guide.id,
        slug: guide.slug,
        title: guide.title,
        category: guide.category,
        steps: guide.step_metadata,
        default_persona: guide.default_avatar_persona,
        avatar_url: avatar_override_url || '/avatars/ran_kosta_default.png',
        wifi: custom_wifi_name ? { ssid: custom_wifi_name, password: custom_wifi_password || '' } : null,
        notes: custom_notes || null,
        pushed_at: new Date().toISOString()
      }
    };

    // 5. Broadcast to Supabase Realtime endpoint
    try {
      await fetch(`${postgrestUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`
        },
        body: JSON.stringify({
          messages: [
            {
              topic: `realtime:${channelName}`,
              event: 'ROOM_GUIDE_PUSHED',
              payload: broadcastEvent
            }
          ]
        })
      });
    } catch (realtimeErr) {
      console.warn('[Realtime Broadcast Notice]', realtimeErr?.message || realtimeErr);
    }

    console.log(`[TV Push] Successfully broadcasted "${guide.title}" to channel: ${channelName}`);

    return jsonResponse({
      success: true,
      message: `המדריך "${guide.title}" שודר בהצלחה לטלוויזיית היחידה!`,
      channel: channelName,
      broadcasted_at: broadcastEvent.guide.pushed_at,
      guide: {
        id: guide.id,
        title: guide.title,
        steps_count: Array.isArray(guide.step_metadata) ? guide.step_metadata.length : 0
      }
    });
  } catch (err) {
    console.error('[API /api/tv/push-guide Error]', err);
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
