import tls from 'node:tls';
import { config } from '../config.js';

const HOST = 'imap.gmail.com';
const PORT = 993;

export function normalizeAppPassword(raw: string): string {
  return String(raw || '').replace(/\s+/g, '');
}

export function imapQuote(value: string): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function unseenCount(raw: string): number | null {
  const match = String(raw || '').match(/UNSEEN\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email: string;
  unseen: number | null;
  error?: string;
}

function configuredAccount(): { user: string; pass: string } | null {
  const user = config.gmail.user.trim().toLowerCase();
  const pass = normalizeAppPassword(config.gmail.appPassword);
  if (!user || !pass) return null;
  return { user, pass };
}

function imapSession(user: string, pass: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: HOST, port: PORT, servername: HOST });
    let buf = '';
    let step = 0;
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('timeout'));
    }, 12000);
    const done = (err: Error | null, transcript = '') => {
      clearTimeout(timer);
      sock.end();
      if (err) reject(err);
      else resolve(transcript);
    };
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (step === 0 && /\* OK/.test(buf)) {
        step = 1;
        sock.write(`A1 LOGIN ${imapQuote(user)} ${imapQuote(pass)}\r\n`);
        return;
      }
      if (step === 1 && /\nA1 /.test(`\n${buf}`)) {
        if (!/\nA1 OK/.test(`\n${buf}`)) {
          done(new Error('login failed'));
          return;
        }
        step = 2;
        buf = '';
        sock.write('A2 STATUS INBOX (UNSEEN)\r\n');
        return;
      }
      if (step === 2 && /\nA2 /.test(`\n${buf}`)) {
        sock.write('A3 LOGOUT\r\n');
        done(null, buf);
      }
    });
    sock.on('error', (err) => done(err));
  });
}

let cache: { at: number; status: GmailStatus } | null = null;

/** Confirm the studio can open the configured Gmail inbox. */
export async function gmailStatus(force = false): Promise<GmailStatus> {
  const account = configuredAccount();
  if (!account) {
    return { configured: false, connected: false, email: config.gmail.user.trim().toLowerCase(), unseen: null };
  }
  if (!force && cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.status;
  try {
    const transcript = await imapSession(account.user, account.pass);
    const status: GmailStatus = {
      configured: true,
      connected: true,
      email: account.user,
      unseen: unseenCount(transcript),
    };
    cache = { at: Date.now(), status };
    return status;
  } catch (err) {
    const status: GmailStatus = {
      configured: true,
      connected: false,
      email: account.user,
      unseen: null,
      error: err instanceof Error ? err.message : 'login failed',
    };
    cache = { at: Date.now(), status };
    return status;
  }
}
