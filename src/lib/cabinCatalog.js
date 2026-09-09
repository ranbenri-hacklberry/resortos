import { PROPERTY_THEMES } from './multiPropertyCatalog.js';
import { unitMaxOccupancy } from './units.js';

const byId = new Map();
for (const property of Object.values(PROPERTY_THEMES)) {
  for (const unit of property.units || []) {
    if (!unit?.id || unit.isFullBuyout) continue;
    byId.set(unit.id, {
      id: unit.id,
      name: unit.name,
      description: unit.description || '',
      features: Array.isArray(unit.features) ? unit.features : [],
      maxOccupancy: Number(unit.maxOccupancy) || unitMaxOccupancy(unit.id),
      bedrooms: unit.bedrooms || null,
      bathrooms: unit.bathrooms || null,
      sizeM2: unit.sizeM2 || null,
      propertyName: property.hebrewName || property.name || '',
      propertyAmenities: Array.isArray(property.amenities) ? property.amenities : []
    });
  }
}

export function cabinCatalog(id) {
  const hit = byId.get(String(id || ''));
  if (hit) return hit;
  if (!id) return null;
  return {
    id,
    name: '',
    description: '',
    features: [],
    maxOccupancy: unitMaxOccupancy(id),
    bedrooms: null,
    bathrooms: null,
    sizeM2: null,
    propertyName: '',
    propertyAmenities: []
  };
}

export function cabinFactLine(id) {
  const cabin = cabinCatalog(id);
  if (!cabin) return '';
  const bits = [`עד ${cabin.maxOccupancy} אורחים`];
  if (cabin.bedrooms) bits.push(`${cabin.bedrooms} חדרי שינה`);
  if (cabin.sizeM2) bits.push(`${cabin.sizeM2} מ״ר`);
  return bits.join(' · ');
}
