import { describe, expect, it } from 'vitest';
import { googleMapsUrl, UNIT_NAV_OVERRIDES, unitNav, wazeUrl } from './stayProperty.js';
import { PROPERTY_SEED, UNIT_OVERRIDES } from './guestProfileSeed.js';
import { ramotPublicList, ramotSecrets } from './ramotDirectory.js';
import { projectGuestPage } from './guestPageRead.js';

describe('ResortOS Guest Navigation & Coordinates', () => {
  describe('Ramot complexes exact Maps and Waze URLs', () => {
    it('has exact navigation for all 7 Ramot complexes in PROPERTY_SEED', () => {
      expect(PROPERTY_SEED.nurit.content.nav.waze).toBe('https://waze.com/ul/hsvc6gs4p2');
      expect(PROPERTY_SEED.nurit.content.nav.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.850371,35.664408');

      expect(PROPERTY_SEED.taj.content.nav.waze).toBe('https://waze.com/ul/hsvc6gsskp');
      expect(PROPERTY_SEED.taj.content.nav.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.852592,35.667799');

      expect(PROPERTY_SEED.mool.content.nav.waze).toBe('https://waze.com/ul/hsvc6gtk3v');
      expect(PROPERTY_SEED.mool.content.nav.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.856309,35.667694');

      expect(PROPERTY_SEED.nofim.content.nav.waze).toBe('https://waze.com/ul/hsvc6gt4ct');
      expect(PROPERTY_SEED.nofim.content.nav.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.854897,35.665635');

      expect(PROPERTY_SEED.toscana.content.nav.waze).toBe('https://waze.com/ul/hsvc6gsutg');
      expect(PROPERTY_SEED.toscana.content.nav.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.854241,35.667930');

      expect(PROPERTY_SEED.musical.content.nav.waze).toBe('https://waze.com/ul/hsvc6gsdq7');
      expect(PROPERTY_SEED.musical.content.nav.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.852962,35.664861');

      expect(PROPERTY_SEED.maya.content.nav.waze).toBe('https://waze.com/ul/hsvc6gs4k0');
      expect(PROPERTY_SEED.maya.content.nav.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.849829,35.664732');
    });

    it('matches ramotPublicList in ramotDirectory', () => {
      const publicList = ramotPublicList();
      const byId = Object.fromEntries(publicList.map((row) => [row.id, row]));

      expect(byId.nurit.wazeUrl).toBe('https://waze.com/ul/hsvc6gs4p2');
      expect(byId.nurit.mapsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=32.850371,35.664408');

      expect(byId.taj.wazeUrl).toBe('https://waze.com/ul/hsvc6gsskp');
      expect(byId.taj.mapsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=32.852592,35.667799');

      expect(byId.mool.wazeUrl).toBe('https://waze.com/ul/hsvc6gtk3v');
      expect(byId.mool.mapsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=32.856309,35.667694');

      expect(byId.nofim.wazeUrl).toBe('https://waze.com/ul/hsvc6gt4ct');
      expect(byId.nofim.mapsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=32.854897,35.665635');

      expect(byId.toscana.wazeUrl).toBe('https://waze.com/ul/hsvc6gsutg');
      expect(byId.toscana.mapsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=32.854241,35.667930');

      expect(byId.musical.wazeUrl).toBe('https://waze.com/ul/hsvc6gsdq7');
      expect(byId.musical.mapsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=32.852962,35.664861');

      expect(byId.maya.wazeUrl).toBe('https://waze.com/ul/hsvc6gs4k0');
      expect(byId.maya.mapsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=32.849829,35.664732');
    });
  });

  describe('Casa Nova (Aura & Bloom) navigation', () => {
    it('provides exact GPS navigation and does not show unavailable', () => {
      const auraNav = unitNav('k826');
      expect(auraNav.unavailable).toBe(false);
      expect(googleMapsUrl('k826')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8277487,35.7808935');
      expect(wazeUrl('k826')).toBe('https://waze.com/ul?ll=32.8277487,35.7808935&navigate=yes');

      const bloomNav = unitNav('k827');
      expect(bloomNav.unavailable).toBe(false);
      expect(googleMapsUrl('k827')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8277491,35.7809611');
      expect(wazeUrl('k827')).toBe('https://waze.com/ul?ll=32.8277491,35.7809611&navigate=yes');
    });

    it('projects guest page for Casa Nova without missing arrival', () => {
      const pageAura = projectGuestPage({ unit_id: 'k826' });
      expect(pageAura.arrival.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8277487,35.7808935');
      expect(pageAura.arrival.waze).toBe('https://waze.com/ul?ll=32.8277487,35.7808935&navigate=yes');

      const pageBloom = projectGuestPage({ unit_id: 'k827' });
      expect(pageBloom.arrival.maps).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8277491,35.7809611');
      expect(pageBloom.arrival.waze).toBe('https://waze.com/ul?ll=32.8277491,35.7809611&navigate=yes');
    });
  });

  describe('Per-unit GPS coordinate overrides', () => {
    it('routes Dome units to individual domes', () => {
      expect(googleMapsUrl('dome-red')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8022197,35.6830016');
      expect(googleMapsUrl('dome-green')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8021462,35.6828917');
      expect(googleMapsUrl('dome-blue')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8023302,35.6831226');
    });

    it('routes Mialees units to individual suites and villa', () => {
      expect(googleMapsUrl('suite-1')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.7835566,35.6868208');
      expect(googleMapsUrl('suite-2')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.7836233,35.6868252');
      expect(googleMapsUrl('mialis-villa')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.7834989,35.6869576');
    });

    it('routes Hill units to individual cabins', () => {
      expect(googleMapsUrl('hill-1')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8011237,35.6845369');
      expect(googleMapsUrl('hill-2')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8012232,35.6846325');
      expect(googleMapsUrl('hill-3')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8013035,35.6845212');
      expect(googleMapsUrl('hill-4')).toBe('https://www.google.com/maps/dir/?api=1&destination=32.8011534,35.6844202');
    });
  });

  describe('No regression on Wi-Fi and gate codes', () => {
    it('preserves Ramot Wi-Fi credentials', () => {
      const secrets = ramotSecrets();
      const byId = Object.fromEntries(secrets.complexes.map((c) => [c.id, c]));

      expect(byId.nurit.wifi[0]).toEqual({ ssid: 'MIALEES RESORT', password: 'MIAL2026' });
      expect(byId.taj.wifi[0]).toEqual({ ssid: 'lotus', password: '12345678' });
      expect(byId.mool.wifi[0]).toEqual({ ssid: 'Mol_hanof', password: '12345678' });
      expect(byId.nofim.wifi[0]).toEqual({ ssid: 'TP-LINK_FA30', password: '15107312' });
      expect(byId.toscana.wifi[0]).toEqual({ ssid: 'Toscana', password: '12345678' });
      expect(byId.musical.wifi[0]).toEqual({ ssid: 'Music yard', password: '12345678' });
      expect(byId.maya.wifi[0]).toEqual({ ssid: 'maya', password: '12345678' });
    });

    it('preserves gate codes', () => {
      expect(ramotSecrets().gate).toBe('#2464');
      expect(PROPERTY_SEED['casa-nova'].access.gate.mode).toBe('call');
      expect(PROPERTY_SEED['casa-nova'].access.gate.nightCall).toBe(true);
      expect(PROPERTY_SEED['casa-nova'].access.gate.shabbatClose).toBe(true);
      expect(PROPERTY_SEED['casa-nova'].access.wifi[0]).toEqual({ ssid: 'MIALEES', password: 'AD654321' });
    });
  });
});
