import { createClient } from '@supabase/supabase-js';

const getHost = () => {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.hostname;
  }
  return '100.82.152.52';
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `http://${getHost()}:54321`;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvc3RncmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDU1NzM4MTksImV4cCI6MTk2MTE0OTgxOX0.dummy_token';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

