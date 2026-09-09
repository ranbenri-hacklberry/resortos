import { depositIlsFromTotal } from './deposit';

export function nightsCount(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000));
}

export function nightlyIlsFromUnit(unit) {
  return Math.round((Number(unit?.base_price_agorot) || 85000) / 100);
}

export function stayTotalIls(nightlyIls, nights, multiplier = 1) {
  return Math.round(Number(nightlyIls || 0) * Math.max(1, Number(nights) || 1) * Number(multiplier || 1));
}

export function nightlyFromTotalIls(totalIls, nights) {
  const n = Math.max(1, Number(nights) || 1);
  return Math.round(Number(totalIls || 0) / n);
}

export function pricedStay(nightlyIls, nights, multiplier = 1) {
  const totalIls = stayTotalIls(nightlyIls, nights, multiplier);
  return {
    nightlyIls: Number(nightlyIls || 0),
    nights: Math.max(1, Number(nights) || 1),
    totalIls,
    depositIls: depositIlsFromTotal(totalIls)
  };
}

export function ilsToAgorot(ils) {
  return Math.round(Number(ils || 0) * 100);
}
