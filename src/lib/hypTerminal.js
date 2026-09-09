export const HYP_TERMINAL_A = '4502210929';
export const HYP_TERMINAL_B = '4502315932';

export function defaultHypTerminal(paymentMode) {
  return paymentMode === 'CREDIT_FULL' ? 'A' : 'B';
}

export function normalizeHypTerminal(value, paymentMode) {
  const t = String(value || '').toUpperCase();
  if (t === 'A' || t === 'B') return t;
  return defaultHypTerminal(paymentMode);
}

export function hypTerminalLabel(terminal) {
  return terminal === 'A'
    ? `A יתרות · ${HYP_TERMINAL_A}`
    : `B מקדמות · ${HYP_TERMINAL_B}`;
}
