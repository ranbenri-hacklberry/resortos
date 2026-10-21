import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../config.js';

/**
 * Manager-only SMS (approved by Ran 2026-10-19 12:12 for late-checkout alerts).
 * Reuses the same Micropay sender callMe.js uses for its parallel SMS to Ran
 * (server/micropaySms.js → sendMicropaySms). MICROPAY_TOKEN / MICROPAY_FROM come from the
 * repo .env that config.ts already loads into this process. Never call this with guest numbers.
 */
export const MANAGER_SMS_PHONE = '0506102416';

type SendFn = (p: { phone: string; message: string; skipBcc?: boolean }) => Promise<unknown>;
let sender: Promise<SendFn> | null = null;

function loadSender(): Promise<SendFn> {
  if (!sender) {
    const file = path.resolve(ROOT, '../../server/micropaySms.js');
    sender = import(pathToFileURL(file).href).then((m) => m.sendMicropaySms as SendFn);
  }
  return sender;
}

export async function sendManagerSms(message: string): Promise<void> {
  const send = await loadSender();
  await send({ phone: MANAGER_SMS_PHONE, message: String(message).slice(0, 600), skipBcc: true });
}
