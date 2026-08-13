import { createClient } from '@supabase/supabase-js';

const getHost = () => {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.hostname;
  }
  return '127.0.0.1';
};

const SUPABASE_URL = `http://${getHost()}:54321`;
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function authorizeUser(phone) {
  try {
    let cleanPhone = phone;
    if (phone && phone.startsWith('972')) {
      cleanPhone = '0' + phone.substring(3);
    }
    
    // Timeout promise after 1.5s to prevent blank loading screens on remote devices
    const queryPromise = supabase
      .from('employees')
      .select('business_id, business_name, name, access_level, is_admin, is_super_admin')
      .or(`phone.eq.${phone},whatsapp_phone.eq.${phone},phone.eq.${cleanPhone},whatsapp_phone.eq.${cleanPhone}`);

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 1500));

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
    
    if (error || !data || data.length === 0) {
      console.log('[Auth] No employee found for phone:', phone, error?.message);
      return { authorized: false, entities: [] };
    }
    
    console.log(`[Auth] Found ${data.length} employee record(s) for ${phone}`);
    return {
      authorized: true,
      entities: data.map(e => ({
        businessId: e.business_id,
        businessName: e.business_name || '',
        role: e.access_level,
        isAdmin: e.is_admin,
        isSuperAdmin: e.is_super_admin,
        name: e.name,
        phone: phone
      }))
    };
  } catch (err) {
    console.warn('[Auth] Fallback engaged:', err.message);
    return { authorized: false, entities: [] };
  }
}
