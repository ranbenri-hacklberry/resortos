import { ManagedProperty } from '../components/resortos/HostPropertyEditor';
import weekendLeadsRaw from '../../data/resortos-seed-weekend.json';

/**
 * 693 Authentic Northern hospitality leads scraped from Weekend
 * Strict copyright rules:
 * - is_public = false (Default Hidden)
 * - hero_image = null (Luxury placeholder used on frontend)
 * - reference_image_urls = internal only for host verification
 * - source_url = points to original Weekend listing
 */
export function getWeekendRealLeads(): ManagedProperty[] {
  return (weekendLeadsRaw as any[]).map((raw, idx) => {
    let cleanWhatsApp = (raw.whatsapp_number || '').replace(/\D/g, '');
    if (cleanWhatsApp && !cleanWhatsApp.startsWith('972')) {
      cleanWhatsApp = '972' + cleanWhatsApp.replace(/^0/, '');
    }

    const units = Array.isArray(raw.units) && raw.units.length > 0
      ? raw.units.map((u: any, uIdx: number) => ({
          id: `u-weekend-${idx + 1}-${uIdx + 1}`,
          name: u.name || `יחידה ${uIdx + 1}`,
          type: (u.type || 'cabin') as any,
          bedrooms: u.bedrooms || 1,
          bathrooms: u.bathrooms || 1,
          max_occupancy: u.max_occupancy || 4,
          base_price: Number(u.base_price) || 750,
          weekend_price: Number(u.weekend_price) || 1000,
          size_m2: u.size_m2 || 40,
          features: u.features || ['ג׳קוזי ספא', 'מרפסת דק']
        }))
      : [
          {
            id: `u-weekend-${idx + 1}-1`,
            name: 'יחידת אירוח ראשית',
            type: 'cabin' as const,
            bedrooms: 1,
            bathrooms: 1,
            max_occupancy: 4,
            base_price: 750,
            weekend_price: 1000,
            size_m2: 40,
            features: ['ג׳קוזי ספא', 'מרפסת דק']
          }
        ];

    return {
      id: `weekend-lead-${raw._weekend_id || idx + 1000}`,
      slug: raw.slug || `lead-${idx + 1}`,
      name: raw.slug ? raw.slug.replace(/-/g, ' ').toUpperCase() : `Resort ${idx + 1}`,
      hebrew_name: raw.hebrew_name,
      tagline: raw.tagline || `מתחם אירוח כפרי ב${raw.village}, ${raw.region}`,
      description: raw.description || `מתחם אירוח כפרי ויוקרתי במושב ${raw.village}.`,
      village: raw.village,
      region: raw.region,
      address: `מושב ${raw.village}`,
      whatsapp_number: cleanWhatsApp || (raw.phone ? raw.phone.replace(/\D/g, '') : ''),
      phone: raw.phone || '',
      email: raw.email || '',
      // STRICT COPYRIGHT: hero_image is null for public (or luxury placeholder)
      hero_image: null,
      gallery_images: [],
      // Reference images are kept strictly in internal column
      reference_image_urls: raw.reference_image_urls || [],
      amenities: Array.isArray(raw.amenities) ? raw.amenities : [],
      units,
      claimed_status: 'unclaimed_seeded' as const,
      direct_booking_enabled: false,
      crm_status: (raw.crm_status || 'Lead_Identified') as any,
      is_public: false, // Default Hidden!
      source: 'weekend_scrape',
      source_url: raw._source_url || raw.source_url || 'https://www.weekend.co.il',
      first_touch_sent_at: raw.first_touch_sent_at || null,
      property_public_path: `/p/${raw.slug}`
    };
  });
}

export function generateSeededLeads(count = 693): ManagedProperty[] {
  const real = getWeekendRealLeads();
  if (real && real.length > 0) {
    return real.slice(0, count);
  }
  return [];
}
