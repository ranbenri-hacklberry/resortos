import { createClient } from '@supabase/supabase-js';

function isLoopbackHost(host) {
  return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function resolveSupabaseUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (!isLoopbackHost(host)) {
      return `${window.location.origin}/pg`;
    }
  }
  const fromEnv = import.meta.env.VITE_SUPABASE_URL;
  if (fromEnv && /^https?:\/\//.test(fromEnv) && !String(fromEnv).includes('127.0.0.1')) {
    return String(fromEnv).replace(/\/$/, '');
  }
  return 'http://127.0.0.1:54321';
}

const supabaseUrl = resolveSupabaseUrl();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvc3RncmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDU1NzM4MTksImV4cCI6MTk2MTE0OTgxOX0.dummy_token';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
