import { createHash } from 'crypto';

export function hashAgentPin(phone, pin, pepper) {
  const digits = String(phone || '').replace(/\D/g, '');
  const pin4 = String(pin || '').replace(/\D/g, '').slice(0, 4);
  const hex = createHash('sha256').update(`${pepper}:${digits}:${pin4}`).digest('hex');
  return `sha256:${hex}`;
}

export function pinPepper() {
  return String(process.env.AGENT_PIN_PEPPER || process.env.CHECKOUT_MAILBOX_SECRET || '').trim();
}
