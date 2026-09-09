/** Expected deposit as a share of the stay total. */
export const DEPOSIT_RATE = 0.2;

export function depositIlsFromTotal(totalIls) {
  return Math.round(Number(totalIls || 0) * DEPOSIT_RATE);
}

export function depositAgorotFromTotal(totalAgorot) {
  return Math.round(Number(totalAgorot || 0) * DEPOSIT_RATE);
}

export function looksLikeDefaultDeposit(depositAgorot, totalAgorot, rate = 0.25) {
  const total = Number(totalAgorot || 0);
  const deposit = Number(depositAgorot || 0);
  if (total <= 0) return deposit <= 0;
  return deposit === Math.round(total * rate);
}
