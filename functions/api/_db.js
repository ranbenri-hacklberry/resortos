/**
 * Cloudflare Pages Functions shared DB helper
 * Securely communicates with Supabase/Studio PostgREST using service_role secrets.
 * Zero database credentials are ever returned to the client browser.
 */

export const DEFAULT_TENANT_ID = '22222222-2222-2222-2222-222222222222';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...headers
    }
  });
}

export function errorJson(message, status = 400, code = 'ERROR') {
  return json({ error: code, message }, status);
}

export function getPostgrestConfig(env) {
  const baseUrl = (
    env?.SUPABASE_URL ||
    env?.STUDIO_BRIDGE_URL ||
    env?.HOTELOS_BRIDGE_URL ||
    'http://127.0.0.1:54321'
  ).replace(/\/$/, '');

  const apiKey = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_ANON_KEY || '';
  const tenantId = env?.HOTELOS_TENANT_ID || DEFAULT_TENANT_ID;
  const bridgeSecret = env?.HOTELOS_API_SECRET || '';

  return { baseUrl, apiKey, tenantId, bridgeSecret };
}

export function isLocalPostgrestUrl(baseUrl) {
  const host = String(baseUrl || '');
  return /127\.0\.0\.1|localhost|\[::1\]/i.test(host);
}

export async function fetchPostgrest(path, options = {}, env) {
  const { baseUrl, apiKey, bridgeSecret } = getPostgrestConfig(env);
  if (isLocalPostgrestUrl(baseUrl)) return null;
  const url = `${baseUrl}/rest/v1${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { apikey: apiKey, Authorization: `Bearer ${apiKey}` } : {}),
    ...(bridgeSecret ? { 'x-hotelos-bridge-secret': bridgeSecret } : {}),
    ...options.headers
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(6000)
    });
    return res;
  } catch (err) {
    console.warn('[PostgREST Fetch Error]', path, err?.message || err);
    return null;
  }
}
