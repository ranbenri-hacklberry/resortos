import { createClient } from '@supabase/supabase-js';

function isLoopbackHost(host) {
  return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isLoopbackUrl(url) {
  return /127\.0\.0\.1|localhost|::1/i.test(String(url || ''));
}

function resolveSupabaseUrl() {
  const fromEnv = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const envCloud = fromEnv && /^https?:\/\//.test(fromEnv) && !isLoopbackUrl(fromEnv)
    ? String(fromEnv).replace(/\/$/, '')
    : '';

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    // Local Studio browser can hit PostgREST directly.
    if (isLoopbackHost(host)) {
      return fromEnv || 'http://127.0.0.1:54321';
    }
    // Remote hosts (ops.resortos.app, tunnels): never use loopback env —
    // that points at the phone, not the Mac Studio. Prefer cloud URL or /pg proxy.
    if (envCloud) return envCloud;
    return `${window.location.origin}/pg`;
  }
  return envCloud || fromEnv || 'http://127.0.0.1:54321';
}

const supabaseUrl = resolveSupabaseUrl();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

