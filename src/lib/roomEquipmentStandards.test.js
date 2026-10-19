import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_STANDARDS,
  EQUIPMENT_STATUS,
  ITEM_CATEGORIES,
  EQUIPMENT_CATALOG,
  calculateLinenRequirements,
  calculateTowelRequirements,
  calculateBathroomMats,
  calculateToiletriesRequirements,
  createAcConfig,
  createTvConfig,
  CANONICAL_UNIT_EQUIPMENT_PROFILES,
  getUnitEquipmentProfile,
  calculateRoomRequirements,
  generateHousekeepingChecklist,
  generateManagementShortageReport,
  queryChloeRoomEquipment,
  parseBedNotation,
  CONFIRMED_ROOM_CONFIGURATIONS,
  generateConfirmedRoomsReport,
  getUnmappedResortUnits
} from './roomEquipmentStandards.js';

describe('Room Equipment & Inventory Standards', () => {

  it('Criterion 1 & 6: Implements Couple (2 guests) and Family (6 guests) kitchen standards without dessert plates', () => {
    // Couple requirements
    const coupleReq = calculateRoomRequirements({ profileType: EQUIPMENT_STANDARDS.COUPLE, guests: 2 });
    expect(coupleReq.kitchen.dinnerPlates).toBe(2);
    expect(coupleReq.kitchen.drinkingGlasses).toBe(2);
    expect(coupleReq.kitchen.coffeeMugs).toBe(2);
    expect(coupleReq.kitchen.wineGlasses).toBe(2);
    expect(coupleReq.kitchen.cutlerySets).toBe(2);
    expect(coupleReq.kitchen.smallBowls).toBe(0);
    expect(coupleReq.kitchen.cookingPot).toBe(1);
    expect(coupleReq.kitchen.fryingPan).toBe(1);
    expect(coupleReq.kitchen.dessertPlates).toBe(0);

    // Family requirements
    const familyReq = calculateRoomRequirements({ profileType: EQUIPMENT_STANDARDS.FAMILY, guests: 6 });
    expect(familyReq.kitchen.dinnerPlates).toBe(6);
    expect(familyReq.kitchen.drinkingGlasses).toBe(6);
    expect(familyReq.kitchen.coffeeMugs).toBe(6);
    expect(familyReq.kitchen.wineGlasses).toBe(6);
    expect(familyReq.kitchen.cutlerySets).toBe(6);
    expect(familyReq.kitchen.smallBowls).toBe(4);
    expect(familyReq.kitchen.cookingPot).toBe(1);
    expect(familyReq.kitchen.fryingPan).toBe(1);
    expect(familyReq.kitchen.dessertPlates).toBe(0);
  });

  it('Criterion 2: Bed linen calculated correctly for double, single, and double sofa beds', () => {
    // Example from specification: Configuration: 2+1+1
    const config211 = calculateLinenRequirements('2+1+1');
    expect(config211.pillows).toBe(6);
    expect(config211.pillowcases).toBe(6);
    expect(config211.doubleDuvets).toBe(1);
    expect(config211.singleDuvets).toBe(2);
    expect(config211.doubleDuvetCovers).toBe(1);
    expect(config211.singleDuvetCovers).toBe(2);
    expect(config211.doubleSheets).toBe(1);
    expect(config211.singleSheets).toBe(2);

    // Double sofa bed: 2 pillows, 2 pillowcases, 1 double duvet, 1 double duvet cover, 1 double sheet
    const sofaConfig = calculateLinenRequirements('sofa_2');
    expect(sofaConfig.pillows).toBe(2);
    expect(sofaConfig.pillowcases).toBe(2);
    expect(sofaConfig.doubleDuvets).toBe(1);
    expect(sofaConfig.doubleDuvetCovers).toBe(1);
    expect(sofaConfig.doubleSheets).toBe(1);

    // Combined double + sofa bed: 2 + sofa_2
    const combined = calculateLinenRequirements('2+sofa_2');
    expect(combined.pillows).toBe(6);
    expect(combined.pillowcases).toBe(6);
    expect(combined.doubleDuvets).toBe(2);
    expect(combined.doubleSheets).toBe(2);
  });

  it('Criterion 3: Towels calculated per guest (2 body/pool + 1 face) without night multiplication', () => {
    // 6 guests, any number of nights
    const towels6 = calculateTowelRequirements(6);
    expect(towels6.totalBodyTowels).toBe(12);
    expect(towels6.faceTowels).toBe(6);
    expect(towels6.regularBodyTowels).toBe(6);
    expect(towels6.poolTowels).toBe(6);

    // 2 guests
    const towels2 = calculateTowelRequirements(2);
    expect(towels2.totalBodyTowels).toBe(4);
    expect(towels2.faceTowels).toBe(2);

    // Fallback when pool towels unavailable: still 2 body towels per guest
    const noPoolTowels = calculateTowelRequirements(2, { poolTowelsAvailable: false });
    expect(noPoolTowels.totalBodyTowels).toBe(4);
    expect(noPoolTowels.regularBodyTowels).toBe(4);
    expect(noPoolTowels.poolTowels).toBe(0);
  });

  it('Criterion 4: Toiletries calculated strictly as guests × nights for all 4 items', () => {
    // Example from specification: 2 guests, 3 nights
    const t23 = calculateToiletriesRequirements(2, 3);
    expect(t23.shampoo).toBe(6);
    expect(t23.bodyWash).toBe(6);
    expect(t23.bodyLotion).toBe(6);
    expect(t23.solidSoap).toBe(6);

    // Example from specification: 6 guests, 2 nights
    const t62 = calculateToiletriesRequirements(6, 2);
    expect(t62.shampoo).toBe(12);
    expect(t62.bodyWash).toBe(12);
    expect(t62.bodyLotion).toBe(12);
    expect(t62.solidSoap).toBe(12);
  });

  it('Criterion 5: Coffee station consumables match standard; espresso capsules conditioned on machine', () => {
    // Couple without verified espresso machine
    const coupleNoEspresso = calculateRoomRequirements({
      profileType: EQUIPMENT_STANDARDS.COUPLE,
      hasVerifiedEspresso: false
    });
    expect(coupleNoEspresso.coffeeStation.instantCoffee).toBe(4);
    expect(coupleNoEspresso.coffeeStation.blackCoffee).toBe(4);
    expect(coupleNoEspresso.coffeeStation.regularTea).toBe(4);
    expect(coupleNoEspresso.coffeeStation.masalaTea).toBe(4);
    expect(coupleNoEspresso.coffeeStation.whiteSugar).toBe(8);
    expect(coupleNoEspresso.coffeeStation.brownSugar).toBe(8);
    expect(coupleNoEspresso.coffeeStation.sweetener).toBe(8);
    expect(coupleNoEspresso.coffeeStation.espressoCapsules).toBe(0);
    expect(coupleNoEspresso.coffeeStation.saltShaker).toBe(1);
    expect(coupleNoEspresso.coffeeStation.pepperShaker).toBe(1);

    // Couple with verified espresso machine
    const coupleWithEspresso = calculateRoomRequirements({
      profileType: EQUIPMENT_STANDARDS.COUPLE,
      hasVerifiedEspresso: true
    });
    expect(coupleWithEspresso.coffeeStation.espressoCapsules).toBe(4);

    // Family standard coffee quantities
    const familyCoffee = calculateRoomRequirements({
      profileType: EQUIPMENT_STANDARDS.FAMILY,
      hasVerifiedEspresso: true
    });
    expect(familyCoffee.coffeeStation.instantCoffee).toBe(6);
    expect(familyCoffee.coffeeStation.blackCoffee).toBe(6);
    expect(familyCoffee.coffeeStation.regularTea).toBe(6);
    expect(familyCoffee.coffeeStation.masalaTea).toBe(6);
    expect(familyCoffee.coffeeStation.whiteSugar).toBe(12);
    expect(familyCoffee.coffeeStation.brownSugar).toBe(12);
    expect(familyCoffee.coffeeStation.sweetener).toBe(12);
    expect(familyCoffee.coffeeStation.espressoCapsules).toBe(4);
  });

  it('Criterion 7: AC and TV remotes tracked independently from unit counts', () => {
    // e.g., 3 AC units with 1 shared remote
    const sharedAc = createAcConfig({ acCount: 3, remoteCount: 1, remoteArrangement: 'shared' });
    expect(sharedAc.acCount).toBe(3);
    expect(sharedAc.remoteCount).toBe(1);
    expect(sharedAc.remoteArrangement).toBe('shared');

    // TV count = YES receiver count, but TV manufacturer remote tracked separately
    const tvConfig = createTvConfig({ tvCount: 2, yesRemoteCount: 2, tvManufacturerRemoteCount: 0 });
    expect(tvConfig.tvCount).toBe(2);
    expect(tvConfig.yesReceiverCount).toBe(2);
    expect(tvConfig.yesRemoteCount).toBe(2);
    expect(tvConfig.tvManufacturerRemoteCount).toBe(0);
  });

  it('Criterion 8: Shabbat hotplate and water urn marked as on-request only', () => {
    expect(EQUIPMENT_CATALOG.shabbat_hotplate.type).toBe('on_request');
    expect(EQUIPMENT_CATALOG.hot_water_urn.type).toBe('on_request');
    expect(EQUIPMENT_CATALOG.shabbat_hotplate.coupleQty).toBe(0);
    expect(EQUIPMENT_CATALOG.hot_water_urn.coupleQty).toBe(0);

    const roomReq = calculateRoomRequirements({ profileType: EQUIPMENT_STANDARDS.COUPLE });
    expect(roomReq.appliances.shabbatHotplate).toBe('ON_REQUEST_ONLY');
    expect(roomReq.appliances.hotWaterUrn).toBe('ON_REQUEST_ONLY');
  });

  it('Criterion 9: Clothes hangers excluded from standard', () => {
    const roomReq = calculateRoomRequirements({ profileType: EQUIPMENT_STANDARDS.FAMILY });
    expect(roomReq.excludedItems.clothesHangers).toBe(false);
    expect(EQUIPMENT_CATALOG.clothes_hangers).toBeUndefined();
  });

  it('Criterion 10: UNKNOWN status is never reported as MISSING', () => {
    const verifiedInventory = {
      k808: {
        espresso_machine: EQUIPMENT_STATUS.UNKNOWN,
        dinner_plates: 2
      },
      k809: {
        espresso_machine: EQUIPMENT_STATUS.MISSING,
        dinner_plates: 1 // 1 out of 2 is missing
      }
    };

    const report = generateManagementShortageReport({
      units: ['k808', 'k809'],
      verifiedInventory
    });

    // k808 espresso is UNKNOWN -> must NOT be in missingEspressoCount
    expect(report.summary.missingEspressoCount).toBe(1);
    expect(report.summary.unverifiedEspressoCount).toBe(1);

    // Verify row for k808 has shortageQty = 0 and status UNKNOWN
    const k808Row = report.detailedShortageRows.find((r) => r.room === 'k808' && r.item === 'מכונת אספרסו');
    expect(k808Row).toBeDefined();
    expect(k808Row.status).toBe(EQUIPMENT_STATUS.UNKNOWN);
    expect(k808Row.shortageQty).toBe(0);

    // Verify k809 espresso has shortageQty = 1 and status MISSING
    const k809Row = report.detailedShortageRows.find((r) => r.room === 'k809' && r.item === 'מכונת אספרסו');
    expect(k809Row).toBeDefined();
    expect(k809Row.status).toBe(EQUIPMENT_STATUS.MISSING);
    expect(k809Row.shortageQty).toBe(1);
  });

  it('Criterion 11: Housekeeping preparation checklist dynamically generated per reservation', () => {
    const checklist = generateHousekeepingChecklist({
      unitId: 'k680', // Family cabin
      booking: { adults: 2, children: 2, nights: 3, bed_setup: '2+1+1' },
      verifiedInventory: { k680: { espresso_machine: EQUIPMENT_STATUS.VERIFIED_PRESENT } }
    });

    expect(checklist.guestCount).toBe(4);
    expect(checklist.nights).toBe(3);
    expect(checklist.standard).toBe(EQUIPMENT_STANDARDS.FAMILY);

    // Verify sections exist
    const sectionIds = checklist.sections.map((s) => s.id);
    expect(sectionIds).toContain('linen');
    expect(sectionIds).toContain('towels');
    expect(sectionIds).toContain('toiletries');
    expect(sectionIds).toContain('coffee_tea');
    expect(sectionIds).toContain('kitchen_clean');
    expect(sectionIds).toContain('climate_tv');

    // Check toiletries item label for 4 guests × 3 nights = 12
    const toiletriesSec = checklist.sections.find((s) => s.id === 'toiletries');
    expect(toiletriesSec.items.some((it) => it.label.includes('12 בקבוקונים'))).toBe(true);
  });

  it('Criterion 12: Management shortage and purchase reports generated accurately', () => {
    const verified = {
      k808: { espresso_machine: EQUIPMENT_STATUS.VERIFIED_PRESENT, dinner_plates: 2 },
      k809: { espresso_machine: EQUIPMENT_STATUS.MISSING, dinner_plates: 0 },
      k680: { espresso_machine: EQUIPMENT_STATUS.UNKNOWN, dinner_plates: 4 }
    };

    const report = generateManagementShortageReport({
      units: ['k808', 'k809', 'k680'],
      verifiedInventory: verified
    });

    expect(report.summary.totalUnitsAudited).toBe(3);
    expect(report.summary.missingEspressoCount).toBe(1);
    expect(report.summary.verifiedEspressoCount).toBe(1);
    expect(report.summary.unverifiedEspressoCount).toBe(1);

    // Strainers and mixing bowls tracked as TBD purchase items
    expect(report.summary.strainersNeeded).toBe(3);
    expect(report.summary.mixingBowlsNeeded).toBe(3);

    // Operational improvements
    expect(report.operationalImprovements.some((oi) => oi.item.includes('מסננת'))).toBe(true);
    expect(report.operationalImprovements.some((oi) => oi.item.includes('שקיות'))).toBe(true);
  });

  it('Criterion 13: Existing room data preserved (staff units and office flagged, unknown gets NEEDS_REVIEW)', () => {
    // Staff accommodation
    const k678 = getUnitEquipmentProfile('k678');
    expect(k678.standard).toBe(EQUIPMENT_STANDARDS.STAFF);
    expect(k678.isGuestCabin).toBe(false);

    const k679 = getUnitEquipmentProfile('k679');
    expect(k679.standard).toBe(EQUIPMENT_STANDARDS.STAFF);
    expect(k679.isGuestCabin).toBe(false);

    // Office
    const office = getUnitEquipmentProfile('pilot-office');
    expect(office.standard).toBe(EQUIPMENT_STANDARDS.OFFICE);
    expect(office.isGuestCabin).toBe(false);

    // Unknown unit ID preserves current configuration and flags NEEDS_REVIEW
    const unknownUnit = getUnitEquipmentProfile('non-existent-unit-999');
    expect(unknownUnit.standard).toBe(EQUIPMENT_STANDARDS.NEEDS_REVIEW);
    expect(unknownUnit.status).toBe(EQUIPMENT_STANDARDS.NEEDS_REVIEW);
  });

  it('Criterion 14: Chloe agent answers equipment questions accurately according to verified state', () => {
    // Question about Shabbat items
    const shabbatQuery = queryChloeRoomEquipment({ unitId: 'k808', itemQuery: 'יש פלטת שבת?' });
    expect(shabbatQuery.available).toBe(false);
    expect(shabbatQuery.onDemand).toBe(true);
    expect(shabbatQuery.messageHe).toContain('בתיאום מראש בלבד');

    // Question about hangers
    const hangersQuery = queryChloeRoomEquipment({ unitId: 'k808', itemQuery: 'יש קולבים בארון?' });
    expect(hangersQuery.available).toBe(false);
    expect(hangersQuery.messageHe).toContain('אינם חלק מהציוד');

    // Question about espresso machine when UNKNOWN
    const espressoUnknown = queryChloeRoomEquipment({
      unitId: 'k808',
      itemQuery: 'יש מכונת נספרסו?',
      verifiedInventory: { k808: { espresso_machine: EQUIPMENT_STATUS.UNKNOWN } },
      userRole: 'guest'
    });
    expect(espressoUnknown.available).toBe(false);
    expect(espressoUnknown.messageHe.includes('בבקתה קיימת מכונת אספרסו תקינה')).toBe(false);

    // Question about espresso machine when VERIFIED_PRESENT
    const espressoVerified = queryChloeRoomEquipment({
      unitId: 'k808',
      itemQuery: 'יש מכונת נספרסו?',
      verifiedInventory: { k808: { espresso_machine: EQUIPMENT_STATUS.VERIFIED_PRESENT } },
      userRole: 'guest'
    });
    expect(espressoVerified.available).toBe(true);
    expect(espressoVerified.verified).toBe(true);
    expect(espressoVerified.messageHe).toContain('קיימת מכונת אספרסו תקינה');

    // Question about towels
    const towelsQuery = queryChloeRoomEquipment({ unitId: 'k808', itemQuery: 'כמה מגבות מקבלים?' });
    expect(towelsQuery.messageHe).toContain('2 מגבות גוף');
  });

  it('Criterion 15: Bathroom mats and cleaning equipment match specifications', () => {
    // Jacuzzi present -> 2 mats
    const withJacuzzi = calculateBathroomMats(true);
    expect(withJacuzzi.count).toBe(2);
    expect(withJacuzzi.showerMat).toBe(1);
    expect(withJacuzzi.jacuzziMat).toBe(1);

    // No Jacuzzi -> 1 shower mat
    const noJacuzzi = calculateBathroomMats(false);
    expect(noJacuzzi.count).toBe(1);
    expect(noJacuzzi.jacuzziMat).toBe(0);

    // Cleaning equipment
    const req = calculateRoomRequirements({ profileType: EQUIPMENT_STANDARDS.COUPLE });
    expect(req.cleaning.japaneseSponge).toBe(1);
    expect(req.cleaning.microfiberCloth).toBe(1);
    expect(req.cleaning.dishSoap).toBe(1);
    expect(req.cleaning.installedLargeBag).toBe(1);
    expect(req.cleaning.installedSmallBag).toBe(1);
    expect(req.cleaning.targetSpareLargeBags).toBe(2);
    expect(req.cleaning.targetSpareSmallBags).toBe(2);
  });

  describe('Confirmed Room Configurations & Bed Notation', () => {
    it('parses bed notation according to the confirmed rules (first 2 = double, additional 2 = sofa bed, 1 = single)', () => {
      // 2 => 1 double (2 places)
      const p2 = parseBedNotation('2');
      expect(p2.beds).toEqual([{ type: 'double', quantity: 1 }]);
      expect(p2.capacity).toBe(2);

      // 2+2 => 1 double + 1 double sofa bed (4 places)
      const p22 = parseBedNotation('2+2');
      expect(p22.beds).toEqual([
        { type: 'double', quantity: 1 },
        { type: 'double_sofa_bed', quantity: 1 }
      ]);
      expect(p22.capacity).toBe(4);

      // 2+1+1 => 1 double + 2 singles (4 places)
      const p211 = parseBedNotation('2+1+1');
      expect(p211.beds).toEqual([
        { type: 'double', quantity: 1 },
        { type: 'single', quantity: 2 }
      ]);
      expect(p211.capacity).toBe(4);

      // 2+1+1+1+1 => 1 double + 4 singles (6 places)
      const pMool2 = parseBedNotation('2+1+1+1+1');
      expect(pMool2.beds).toEqual([
        { type: 'double', quantity: 1 },
        { type: 'single', quantity: 4 }
      ]);
      expect(pMool2.capacity).toBe(6);

      // 2+1+1+1+1+1 => 1 double + 5 singles (7 places)
      const pToscana3 = parseBedNotation('2+1+1+1+1+1');
      expect(pToscana3.beds).toEqual([
        { type: 'double', quantity: 1 },
        { type: 'single', quantity: 5 }
      ]);
      expect(pToscana3.capacity).toBe(7);

      // 2+1+1+1+2 => 1 double + 3 singles + 1 double sofa bed (7 places)
      const pNofim = parseBedNotation('2+1+1+1+2');
      expect(pNofim.beds).toEqual([
        { type: 'double', quantity: 1 },
        { type: 'single', quantity: 3 },
        { type: 'double_sofa_bed', quantity: 1 }
      ]);
      expect(pNofim.capacity).toBe(7);

      // 2+2+1+1 => 1 double + 1 double sofa bed + 2 singles (6 places)
      const pNurit = parseBedNotation('2+2+1+1');
      expect(pNurit.beds).toEqual([
        { type: 'double', quantity: 1 },
        { type: 'single', quantity: 2 },
        { type: 'double_sofa_bed', quantity: 1 }
      ]);
      expect(pNurit.capacity).toBe(6);
    });

    it('verifies exact counts of confirmed rooms across all 7 properties (26 rooms total)', () => {
      const report = generateConfirmedRoomsReport();
      expect(report.totalConfirmedRooms).toBe(26);
      expect(report.propertyCounts["טאג' מהל"]).toBe(4);
      expect(report.propertyCounts['בקתות מאיה']).toBe(3);
      expect(report.propertyCounts['החצר המוזיקלית']).toBe(3);
      expect(report.propertyCounts['מול הנוף']).toBe(5);
      expect(report.propertyCounts['טוסקנה']).toBe(3);
      expect(report.propertyCounts['נופים בלבן']).toBe(2);
      expect(report.propertyCounts['בתי נורית']).toBe(6);
    });

    it('Mool HaNof: rooms 1, 4, 5 have double sofa bed (2+2); rooms 2, 3 have 4 singles (2+1+1+1+1)', () => {
      // Rooms 1, 4, 5: 2+2, cap 4
      for (const id of ['k680', 'k683', 'k684']) {
        const room = CONFIRMED_ROOM_CONFIGURATIONS[id];
        expect(room.bedNotation).toBe('2+2');
        expect(room.physicalSleepingCapacity).toBe(4);
        expect(room.airConditioners).toBe(2);
        expect(room.televisions).toBe(2);
        expect(room.requiredYesReceivers).toBe(2);
      }

      // Rooms 2, 3: 2+1+1+1+1, cap 6
      for (const id of ['k681', 'k682']) {
        const room = CONFIRMED_ROOM_CONFIGURATIONS[id];
        expect(room.bedNotation).toBe('2+1+1+1+1');
        expect(room.physicalSleepingCapacity).toBe(6);
        expect(room.airConditioners).toBe(2);
        expect(room.televisions).toBe(2);
        expect(room.requiredYesReceivers).toBe(2);
      }
    });

    it('Toscana: Room 3 has private sauna amenity (private_sauna = true), rooms 1 & 2 do not', () => {
      const room1 = CONFIRMED_ROOM_CONFIGURATIONS.k687;
      const room2 = CONFIRMED_ROOM_CONFIGURATIONS.k688;
      const room3 = CONFIRMED_ROOM_CONFIGURATIONS.k689;

      expect(room1.specialAmenities.private_sauna).toBeUndefined();
      expect(room2.specialAmenities.private_sauna).toBeUndefined();
      expect(room3.specialAmenities.private_sauna).toBe(true);
      expect(room3.bedNotation).toBe('2+1+1+1+1+1');
      expect(room3.physicalSleepingCapacity).toBe(7);
      expect(room3.airConditioners).toBe(2);
      expect(room3.televisions).toBe(2);
    });

    it('Nofim Belavan: 2+1+1+1+2 (1 double + 3 singles + 1 sofa bed), cap 7, 3 ACs, 2 TVs', () => {
      for (const id of ['k685', 'k686']) {
        const room = CONFIRMED_ROOM_CONFIGURATIONS[id];
        expect(room.bedNotation).toBe('2+1+1+1+2');
        expect(room.physicalSleepingCapacity).toBe(7);
        expect(room.airConditioners).toBe(3);
        expect(room.televisions).toBe(2);
        expect(room.requiredYesReceivers).toBe(2);
      }
    });

    it('Batei Nurit: Room 1 is 2+2 (cap 4, 2 ACs); Rooms 2-6 are 2+2+1+1 (cap 6, 3 ACs)', () => {
      const room1 = CONFIRMED_ROOM_CONFIGURATIONS.k671;
      expect(room1.bedNotation).toBe('2+2');
      expect(room1.physicalSleepingCapacity).toBe(4);
      expect(room1.airConditioners).toBe(2);
      expect(room1.televisions).toBe(2);

      for (const id of ['k673', 'k674', 'k675', 'k676', 'k677']) {
        const room = CONFIRMED_ROOM_CONFIGURATIONS[id];
        expect(room.bedNotation).toBe('2+2+1+1');
        expect(room.physicalSleepingCapacity).toBe(6);
        expect(room.airConditioners).toBe(3);
        expect(room.televisions).toBe(2);
        expect(room.requiredYesReceivers).toBe(2);
      }
    });

    it('Linen calculations match Section 4 examples exactly', () => {
      // Example 1: Mool Room 2 (1 double + 4 singles)
      const mool2Linen = calculateLinenRequirements('2+1+1+1+1');
      expect(mool2Linen.pillows).toBe(8);
      expect(mool2Linen.pillowcases).toBe(8);
      expect(mool2Linen.doubleDuvets).toBe(1);
      expect(mool2Linen.doubleDuvetCovers).toBe(1);
      expect(mool2Linen.doubleSheets).toBe(1);
      expect(mool2Linen.singleDuvets).toBe(4);
      expect(mool2Linen.singleDuvetCovers).toBe(4);
      expect(mool2Linen.singleSheets).toBe(4);

      // Example 2: Nofim Room 1 (1 double + 3 singles + 1 double sofa bed)
      const nofimLinen = calculateLinenRequirements('2+1+1+1+2');
      expect(nofimLinen.pillows).toBe(9);
      expect(nofimLinen.pillowcases).toBe(9);
      expect(nofimLinen.doubleDuvets).toBe(2);
      expect(nofimLinen.doubleDuvetCovers).toBe(2);
      expect(nofimLinen.doubleSheets).toBe(2);
      expect(nofimLinen.singleDuvets).toBe(3);
      expect(nofimLinen.singleDuvetCovers).toBe(3);
      expect(nofimLinen.singleSheets).toBe(3);
    });

    it('requires YES receivers = televisions and keeps remote inventory UNKNOWN until physically verified', () => {
      for (const room of Object.values(CONFIRMED_ROOM_CONFIGURATIONS)) {
        expect(room.requiredYesReceivers).toBe(room.televisions);
        const profile = CANONICAL_UNIT_EQUIPMENT_PROFILES[room.unitId];
        expect(profile.ac.remoteCount).toBe('UNKNOWN');
        expect(profile.tv.yesRemoteCount).toBe('UNKNOWN');
      }
    });

    it('reports all units outside the 26 confirmed rooms as unmapped', () => {
      const unmapped = getUnmappedResortUnits();
      expect(unmapped.length).toBeGreaterThan(0);
      expect(unmapped).toContain('hill-1');
      expect(unmapped).toContain('mialis-villa');
      expect(unmapped).toContain('k826');
      expect(unmapped).toContain('pilot-office');
      expect(unmapped).toContain('k678');
    });
  });

});

