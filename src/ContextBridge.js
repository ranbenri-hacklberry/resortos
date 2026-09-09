import { supabase } from './supabaseClient';

export { supabase };

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export async function authorizeUser(phone) {
  try {
    const rawDigits = digitsOnly(phone);
    if (rawDigits.length < 8 || rawDigits.length > 15) {
      return { authorized: false, entities: [] };
    }

    let localPhone = rawDigits;
    if (rawDigits.startsWith('972') && rawDigits.length >= 11) {
      localPhone = '0' + rawDigits.substring(3);
    }

    const queryPromise = supabase
      .from('employees')
      .select('business_id, business_name, name, access_level, is_admin, is_super_admin')
      .or(`phone.eq.${rawDigits},whatsapp_phone.eq.${rawDigits},phone.eq.${localPhone},whatsapp_phone.eq.${localPhone}`);

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
