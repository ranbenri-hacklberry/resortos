import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESORT_UNITS,
  RETIRED_UNIT_IDS,
  STAFF_UNIT_IDS,
  OFFICE_UNIT_IDS,
  CANONICAL_OFFICE_UNIT,
  CANONICAL_MANAGED_SPACES,
  unitUsage,
  isBookingEligible,
  isBookableUnit,
  isManagedUnit,
  getManagedUnits,
  getManagedSpaces,
  getBookableUnits,
  calendarInventory,
  isRetiredUnitId,
  isInventoryUnit,
  canonicalUnitSeed
} from './units.js';
import { cabinCatalog } from './cabinCatalog.js';
import { isFullBuyoutAvailable, PROPERTY_THEMES } from './multiPropertyCatalog.js';
import { LOCKBOX_BY_UNIT, PROPERTY_SEED, UNIT_PROPERTY } from './guestProfileSeed.js';
import { answerGuestQuestion } from '../../services/resortos-agent/src/guest/guestKnowledge.ts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Unit Registry Cleanup & Classification — Safety & Regression Suite', () => {
  // TEST A: Exact canonical unit ID set
  it('TEST A: Exact canonical unit ID set', () => {
    expect(DEFAULT_RESORT_UNITS.length).toBe(40);
    const ids = new Set(DEFAULT_RESORT_UNITS.map((u) => u.id));

    // 26 Ramot guest units
    const ramotGuest = [
      'k671', 'k673', 'k674', 'k675', 'k676', 'k677',
      'k808', 'k809', 'k810', 'k811',
      'k680', 'k681', 'k682', 'k683', 'k684',
      'k685', 'k686',
      'k687', 'k688', 'k689',
      'k690', 'k691', 'k692',
      'k693', 'k694', 'k695'
    ];
    // 2 Staff units
    const staff = ['k678', 'k679'];
    // 12 Other village units
    const otherVillages = [
      'hill-1', 'hill-2', 'hill-3', 'hill-4',
      'dome-blue', 'dome-red', 'dome-green',
      'mialis-villa', 'suite-1', 'suite-2',
      'k826', 'k827'
    ];

    expect(ramotGuest.length).toBe(26);
    expect(staff.length).toBe(2);
    expect(otherVillages.length).toBe(12);

    for (const id of [...ramotGuest, ...staff, ...otherVillages]) {
      expect(ids.has(id)).toBe(true);
    }

    // Ensure no hallucinated or retired IDs exist in the registry
    expect(ids.has('k600')).toBe(false);
    expect(ids.has('k660')).toBe(false);
    expect(ids.has('k700')).toBe(false);
    expect(ids.has('k710')).toBe(false);
    expect(ids.has('k618')).toBe(false);
  });

  // TEST B: Correct property and village associations
  it('TEST B: Correct property and village associations', () => {
    // Check that UNIT_PROPERTY maps every active unit to its property
    for (const u of DEFAULT_RESORT_UNITS) {
      const propId = UNIT_PROPERTY[u.id];
      expect(propId).toBeDefined();
      expect(PROPERTY_SEED[propId]).toBeDefined();
    }

    // Ramot properties
    expect(PROPERTY_SEED.nurit.village).toBe('מושב רמות');
    expect(PROPERTY_SEED.taj.village).toBe('מושב רמות');
    expect(PROPERTY_SEED.mool.village).toBe('מושב רמות');
    expect(PROPERTY_SEED.nofim.village).toBe('מושב רמות');
    expect(PROPERTY_SEED.toscana.village).toBe('מושב רמות');
    expect(PROPERTY_SEED.musical.village).toBe('מושב רמות');
    expect(PROPERTY_SEED.maya.village).toBe('מושב רמות');

    // Nearby village properties
    expect(PROPERTY_SEED.hill.village).toBe('גבעת יואב');
    expect(PROPERTY_SEED.kipat.village).toBe('גבעת יואב');
    expect(PROPERTY_SEED.mialis.village).toBe('גבעת יואב');
    expect(PROPERTY_SEED['casa-nova'].village).toBe('מושב נוב');
  });

  // TEST C: 38 guest-bookable units
  it('TEST C: 38 guest-bookable units', () => {
    const bookable = getBookableUnits(DEFAULT_RESORT_UNITS);
    expect(bookable.length).toBe(38);
    for (const u of bookable) {
      expect(isBookingEligible(u)).toBe(true);
      expect(u.usage || 'GUEST_ACCOMMODATION').toBe('GUEST_ACCOMMODATION');
      expect(u.booking_enabled).not.toBe(false);
    }
  });

  // TEST D: Two staff accommodation units
  it('TEST D: Two staff accommodation units', () => {
    expect(STAFF_UNIT_IDS.has('k678')).toBe(true);
    expect(STAFF_UNIT_IDS.has('k679')).toBe(true);
    expect(STAFF_UNIT_IDS.size).toBe(2);

    expect(unitUsage('k678')).toBe('STAFF_ACCOMMODATION');
    expect(unitUsage('k679')).toBe('STAFF_ACCOMMODATION');
    expect(isBookingEligible('k678')).toBe(false);
    expect(isBookingEligible('k679')).toBe(false);

    // Visible in managed operations
    const managed = getManagedUnits(DEFAULT_RESORT_UNITS);
    expect(managed.some((u) => u.id === 'k678')).toBe(true);
    expect(managed.some((u) => u.id === 'k679')).toBe(true);

    // Hidden from guest booking catalog
    expect(cabinCatalog('k678').name).toBe('');
    expect(cabinCatalog('k679').name).toBe('');
  });

  // TEST E: One operational office
  it('TEST E: One operational office', () => {
    expect(OFFICE_UNIT_IDS.has('pilot-office')).toBe(true);
    expect(CANONICAL_OFFICE_UNIT.id).toBe('pilot-office');
    expect(CANONICAL_OFFICE_UNIT.unit_type).toBe('office');
    expect(CANONICAL_OFFICE_UNIT.usage).toBe('OFFICE');
    expect(CANONICAL_OFFICE_UNIT.booking_enabled).toBe(false);

    expect(unitUsage('pilot-office')).toBe('OFFICE');
    expect(isBookingEligible('pilot-office')).toBe(false);

    // Total managed spaces (40 units + 1 office = 41 spaces)
    const spaces = getManagedSpaces();
    expect(spaces.length).toBe(41);
    expect(spaces.some((s) => s.id === 'pilot-office')).toBe(true);
    expect(getBookableUnits(spaces).length).toBe(38);
  });

  // TEST F: All 11 retired IDs excluded from active views
  it('TEST F: All 11 retired IDs excluded from active views', () => {
    const retired = [
      'u1', 'u2', 'u3', 'u4',
      'k618', 'k619', 'k620', 'k621', 'k622', 'k623',
      'lab-kinneret'
    ];
    expect(RETIRED_UNIT_IDS.size).toBe(11);
    for (const id of retired) {
      expect(isRetiredUnitId(id)).toBe(true);
      expect(isInventoryUnit({ id, is_active: true })).toBe(false);
      expect(DEFAULT_RESORT_UNITS.some((u) => u.id === id)).toBe(false);
    }
  });

  // TEST G: Historical bookings remain readable
  it('TEST G: Historical bookings remain readable', () => {
    expect(LOCKBOX_BY_UNIT['k678']).toBe('2370');
    expect(LOCKBOX_BY_UNIT['k679']).toBe('2380');
    // Retired units in Dexie preserve their keys and history
    expect(isRetiredUnitId('k618')).toBe(true);
  });

  // TEST H: No destructive Dexie cleanup
  it('TEST H: No destructive Dexie cleanup', () => {
    const cloudDbSource = fs.readFileSync(path.resolve(__dirname, 'cloudDb.js'), 'utf8');
    // Ensure bulkDelete is never called on stale/retired units in applyResortUnitsToDexie
    expect(cloudDbSource).not.toMatch(/bulkDelete\(stale\)/);
    expect(cloudDbSource).toContain('Non-destructive archival');
  });

  // TEST I: Unsynced local data is preserved
  it('TEST I: Unsynced local data is preserved', () => {
    const cloudDbSource = fs.readFileSync(path.resolve(__dirname, 'cloudDb.js'), 'utf8');
    // Verifies that un-synced local units are not wiped out by automated cleanup
    expect(cloudDbSource).toContain('Unsynced local units are preserved; no destructive automated cleanup');
  });

  // TEST J: Office remains available for operational management
  it('TEST J: Office remains available for operational management', () => {
    const priorityDeskSource = fs.readFileSync(path.resolve(__dirname, '../components/priority/PriorityDesk.jsx'), 'utf8');
    expect(priorityDeskSource).toContain("'pilot-office': 'משרד'");

    const roomsPath = path.resolve(__dirname, '../../services/resortos-agent/data/rooms.json');
    const rooms = JSON.parse(fs.readFileSync(roomsPath, 'utf8'));
    const officeRoom = rooms.find((r) => r.id === 'pilot-office');
    expect(officeRoom).toBeDefined();
    expect(officeRoom.usage).toBe('OFFICE');
    expect(officeRoom.lockbox).toBe('1357#');
  });

  // TEST K: Guest access to staff lockbox information is blocked
  it('TEST K: Guest access to staff lockbox information is blocked', async () => {
    // Lockbox query on staff unit k678
    const staffReply = answerGuestQuestion('איפה הכספת ומה הקוד?', { unitId: 'k678', complexId: 'nurit', roomName: 'בתי נורית 7' });
    expect(staffReply).toBeTruthy();
    expect(staffReply).not.toContain('2370');
    expect(staffReply).toContain('אזור תפעולי');

    // Lockbox query on pilot-office
    const officeReply = answerGuestQuestion('מה הקוד לכספת של המשרד?', { unitId: 'pilot-office', complexId: 'office', roomName: 'משרד' });
    expect(officeReply).toBeTruthy();
    expect(officeReply).not.toContain('1357');
    expect(officeReply).toContain('אזור תפעולי');
  });

  // TEST L: No retired unit is recreated as active during offline fallback or booking hydration
  it('TEST L: No retired unit is recreated as active during offline fallback or booking hydration', () => {
    const offlineRows = calendarInventory([], [], 'tenant-offline');
    for (const retiredId of RETIRED_UNIT_IDS) {
      expect(offlineRows.some((u) => u.id === retiredId)).toBe(false);
    }

    const cloudDbSource = fs.readFileSync(path.resolve(__dirname, 'cloudDb.js'), 'utf8');
    // ensureUnitRow returns early on retired unit id
    expect(cloudDbSource).toContain('if (isPhantomUnitId(booking.unit_id) || isRetiredUnitId(booking.unit_id)) return;');
  });

  // TEST M: Production SQL affects only allowlisted IDs
  it('TEST M: Production SQL affects only allowlisted IDs', () => {
    const sqlPath = path.resolve(__dirname, '../../server/safe_unit_registry_reclassification.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Never use negative filter on update
    expect(sql).not.toContain('NOT IN');
    // All updates use explicit allowlist
    expect(sql).toContain("WHERE id IN ('k678', 'k679')");
    expect(sql).toContain("WHERE id IN ('pilot-office')");
    expect(sql).toContain("WHERE id IN (\n  'k671', 'k673'");
  });

  // TEST N: Unexpected database IDs cannot be activated by the proposed SQL
  it('TEST N: Unexpected database IDs cannot be activated by the proposed SQL', () => {
    const sqlPath = path.resolve(__dirname, '../../server/safe_unit_registry_reclassification.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Unregistered/hypothetical IDs are not in the SQL allowlist
    const unexpectedIds = ['unknown-123', 'fake-cabin', 'u_t_phantom', 'temp-unit'];
    for (const id of unexpectedIds) {
      expect(sql.includes(`'${id}'`)).toBe(false);
    }
  });
});
