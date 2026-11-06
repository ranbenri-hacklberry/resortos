/**
 * Cardcom Invoice Mailbox Fetch
 *
 * IMAP connection to the business mailbox to fetch Cardcom invoice emails.
 * This runs on the Node server (Studio), not in Cloudflare Workers.
 *
 * Environment variables:
 * - CARDCOM_INVOICE_MAILBOX_USER or GMAIL_INVOICE_USER
 * - CARDCOM_INVOICE_MAILBOX_PASSWORD or GMAIL_INVOICE_APP_PASSWORD
 */

import tls from 'node:tls';

const IMAP_HOST = 'imap.gmail.com';
const IMAP_PORT = 993;
const TIMEOUT_MS = 30000;
const MAX_EMAILS = 50;
const SEARCH_DAYS = 7;

export function invoiceMailboxConfigured() {
  const user = String(process.env.CARDCOM_INVOICE_MAILBOX_USER || process.env.GMAIL_INVOICE_USER || '').trim().toLowerCase();
  const pass = String(process.env.CARDCOM_INVOICE_MAILBOX_PASSWORD || process.env.GMAIL_INVOICE_APP_PASSWORD || '').replace(/\s+/g, '');
  return Boolean(user && pass);
}

function getCredentials() {
  const user = String(process.env.CARDCOM_INVOICE_MAILBOX_USER || process.env.GMAIL_INVOICE_USER || '').trim().toLowerCase();
  const pass = String(process.env.CARDCOM_INVOICE_MAILBOX_PASSWORD || process.env.GMAIL_INVOICE_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) {
    const err = new Error('Invoice mailbox not configured');
    err.code = 'MAILBOX_NOT_CONFIGURED';
    throw err;
  }
  return { user, pass };
}

function imapQuote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function imapDate(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

function parseSearchResponse(data) {
  const match = data.match(/\* SEARCH\s+([\d\s]+)/i);
  if (!match) return [];
  return match[1].trim().split(/\s+/).filter(Boolean).map(Number);
}

function parseFetchResponse(data) {
  const emails = [];
  const fetchPattern = /\* (\d+) FETCH \(([^)]+)\)/gi;
  let match;
  while ((match = fetchPattern.exec(data)) !== null) {
    const seqNum = Number(match[1]);
    const parts = match[2];
    
    const uidMatch = parts.match(/UID\s+(\d+)/i);
    const uid = uidMatch ? Number(uidMatch[1]) : seqNum;
    
    emails.push({ seqNum, uid, raw: parts });
  }
  return emails;
}

function parseEnvelopeHeaders(rawBody) {
  const headers = { from: '', subject: '', date: '' };
  const lines = rawBody.split(/\r?\n/);
  let currentHeader = '';
  let currentValue = '';
  
  for (const line of lines) {
    if (!line || line === '') {
      if (currentHeader && currentValue) {
        headers[currentHeader.toLowerCase()] = currentValue.trim();
      }
      break;
    }
    if (/^\s/.test(line)) {
      currentValue += ' ' + line.trim();
    } else {
      if (currentHeader && currentValue) {
        headers[currentHeader.toLowerCase()] = currentValue.trim();
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        currentHeader = line.slice(0, colonIdx).trim();
        currentValue = line.slice(colonIdx + 1).trim();
      }
    }
  }
  return headers;
}

function extractBody(rawEmail) {
  const parts = rawEmail.split(/\r?\n\r?\n/);
  if (parts.length < 2) return '';
  const body = parts.slice(1).join('\n\n');
  if (body.includes('Content-Transfer-Encoding: base64')) {
    const base64Part = body.match(/Content-Transfer-Encoding:\s*base64[\s\S]*?\r?\n\r?\n([\s\S]+?)(?:\r?\n--|\s*$)/i);
    if (base64Part?.[1]) {
      try {
        return Buffer.from(base64Part[1].replace(/\s/g, ''), 'base64').toString('utf8');
      } catch {
        return base64Part[1];
      }
    }
  }
  if (body.includes('Content-Transfer-Encoding: quoted-printable')) {
    return body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return body;
}

class ImapClient {
  constructor(user, pass) {
    this.user = user;
    this.pass = pass;
    this.socket = null;
    this.buffer = '';
    this.tagCounter = 0;
    this.responseHandlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.destroy();
        reject(new Error('Connection timeout'));
      }, TIMEOUT_MS);

      this.socket = tls.connect({ host: IMAP_HOST, port: IMAP_PORT, servername: IMAP_HOST });
      
      this.socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      this.socket.on('data', (chunk) => {
        this.buffer += chunk.toString('utf8');
        this.processBuffer();
      });

      const checkGreeting = () => {
        if (/\* OK/.test(this.buffer)) {
          clearTimeout(timer);
          this.buffer = '';
          resolve();
        } else {
          setTimeout(checkGreeting, 10);
        }
      };
      checkGreeting();
    });
  }

  processBuffer() {
    for (const [tag, handler] of this.responseHandlers.entries()) {
      const pattern = new RegExp(`${tag}\\s+(OK|NO|BAD)[^\\r\\n]*`, 'i');
      const match = this.buffer.match(pattern);
      if (match) {
        const response = this.buffer.slice(0, this.buffer.indexOf(match[0]) + match[0].length);
        this.buffer = this.buffer.slice(this.buffer.indexOf(match[0]) + match[0].length);
        this.responseHandlers.delete(tag);
        handler.resolve({ status: match[1].toUpperCase(), data: response });
      }
    }
  }

  async command(cmd) {
    const tag = `A${++this.tagCounter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseHandlers.delete(tag);
        reject(new Error(`Command timeout: ${cmd.slice(0, 50)}`));
      }, TIMEOUT_MS);

      this.responseHandlers.set(tag, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        }
      });

      this.socket.write(`${tag} ${cmd}\r\n`);
    });
  }

  async login() {
    const result = await this.command(`LOGIN ${imapQuote(this.user)} ${imapQuote(this.pass)}`);
    if (result.status !== 'OK') {
      throw new Error('Login failed');
    }
  }

  async selectInbox() {
    const result = await this.command('SELECT INBOX');
    if (result.status !== 'OK') {
      throw new Error('Failed to select INBOX');
    }
    const existsMatch = result.data.match(/\* (\d+) EXISTS/i);
    return existsMatch ? Number(existsMatch[1]) : 0;
  }

  async searchCardcomEmails(daysBack = SEARCH_DAYS) {
    const since = imapDate(daysBack);
    const result = await this.command(`SEARCH SINCE ${since} FROM "cardcom"`);
    if (result.status !== 'OK') {
      return [];
    }
    return parseSearchResponse(result.data);
  }

  async fetchEmail(seqNum) {
    const result = await this.command(`FETCH ${seqNum} (UID RFC822)`);
    if (result.status !== 'OK') {
      return null;
    }
    const literalMatch = result.data.match(/\{(\d+)\}\r?\n([\s\S]+?)(?:\r?\n\)\r?\n|\)\r?\n)/);
    if (!literalMatch) return null;
    
    const rawEmail = literalMatch[2];
    const headers = parseEnvelopeHeaders(rawEmail);
    const body = extractBody(rawEmail);
    
    return {
      seqNum,
      from: headers.from || '',
      subject: headers.subject || '',
      date: headers.date || '',
      body
    };
  }

  async fetchEmails(seqNums, limit = MAX_EMAILS) {
    const emails = [];
    const toFetch = seqNums.slice(-limit).reverse();
    for (const seqNum of toFetch) {
      try {
        const email = await this.fetchEmail(seqNum);
        if (email) emails.push(email);
      } catch (err) {
        console.warn(`[invoice-fetch] Failed to fetch email ${seqNum}:`, err.message);
      }
    }
    return emails;
  }

  async logout() {
    try {
      await this.command('LOGOUT');
    } catch {
      // Ignore logout errors
    }
  }

  destroy() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

export async function fetchCardcomInvoiceEmails({ daysBack = SEARCH_DAYS, maxEmails = MAX_EMAILS } = {}) {
  const creds = getCredentials();
  const client = new ImapClient(creds.user, creds.pass);
  
  try {
    await client.connect();
    await client.login();
    await client.selectInbox();
    
    const seqNums = await client.searchCardcomEmails(daysBack);
    if (!seqNums.length) {
      return { emails: [], count: 0, searched: daysBack };
    }
    
    const emails = await client.fetchEmails(seqNums, maxEmails);
    await client.logout();
    
    return { emails, count: emails.length, searched: daysBack };
  } finally {
    client.destroy();
  }
}

export async function checkMailboxStatus() {
  if (!invoiceMailboxConfigured()) {
    return { configured: false, connected: false, error: 'Not configured' };
  }
  
  const creds = getCredentials();
  const client = new ImapClient(creds.user, creds.pass);
  
  try {
    await client.connect();
    await client.login();
    const exists = await client.selectInbox();
    await client.logout();
    return { configured: true, connected: true, exists };
  } catch (err) {
    return { configured: true, connected: false, error: err.message };
  } finally {
    client.destroy();
  }
}

let fetchCache = { at: 0, result: null };
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function fetchCardcomInvoiceEmailsCached(options = {}) {
  const now = Date.now();
  if (!options.force && fetchCache.result && now - fetchCache.at < CACHE_TTL_MS) {
    return { ...fetchCache.result, cached: true };
  }
  const result = await fetchCardcomInvoiceEmails(options);
  fetchCache = { at: now, result };
  return result;
}

export function createMockImapClient(mockEmails) {
  return {
    async fetchCardcomInvoiceEmails() {
      return { emails: mockEmails, count: mockEmails.length, searched: 7 };
    },
    async checkMailboxStatus() {
      return { configured: true, connected: true, exists: mockEmails.length };
    }
  };
}
