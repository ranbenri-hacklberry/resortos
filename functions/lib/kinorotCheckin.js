import {
  createZcreditSession,
  fetchResview,
  kinorotLogin,
  kinorotResid,
  parseResviewPayment,
  quoteFromPayment
} from './kinorotZcredit.js';

let memoryJar = null;
let memoryJarAt = 0;

export function kvSessionStore() {
  return {
    async loadJar() {
      if (memoryJar && Date.now() - memoryJarAt < 6 * 3600 * 1000) {
        return new Map(memoryJar);
      }
      return new Map();
    },
    async saveJar(jar) {
      memoryJar = [...jar.entries()];
      memoryJarAt = Date.now();
    }
  };
}

async function sessionJar(env, store) {
  const user = env.KINOROT_USER || '';
  const pass = env.KINOROT_PASSWORD || '';
  if (!user || !pass) {
    const err = new Error('KINOROT_MISSING_CREDS');
    err.code = 'KINOROT_MISSING_CREDS';
    throw err;
  }
  let jar = await store.loadJar();
  if (!jar.size) {
    await kinorotLogin(jar, user, pass);
    await store.saveJar(jar);
  }
  return { jar, user, pass };
}

async function resviewAuthed(env, store, resid) {
  const creds = await sessionJar(env, store);
  let page = await fetchResview(creds.jar, resid);
  if (page.login) {
    creds.jar = new Map();
    await kinorotLogin(creds.jar, creds.user, creds.pass);
    await store.saveJar(creds.jar);
    page = await fetchResview(creds.jar, resid);
  }
  if (page.login) {
    const err = new Error('KINOROT_LOGIN_FAILED');
    err.code = 'KINOROT_LOGIN_FAILED';
    throw err;
  }
  await store.saveJar(creds.jar);
  return { ...creds, page };
}

export async function quoteKinorotCheckin(booking, env, store) {
  const resid = kinorotResid(booking);
  if (!resid) {
    return { resid: '', amount: 0, last4: '', hasCard: false, invoiceName: booking.guest_name || '', needsCharge: false, available: false };
  }
  const { page } = await resviewAuthed(env, store, resid);
  return { ...quoteFromPayment(parseResviewPayment(page.text), { ...booking, special_requests: `kinorot:${resid}` }), available: true };
}

export async function startKinorotCheckin(booking, env, store) {
  const quote = await quoteKinorotCheckin(booking, env, store);
  if (!quote.available) return { quote, iframeUrl: null, skipped: true };
  if (!quote.needsCharge) return { quote, iframeUrl: null, skipped: true };
  const { jar, user, pass } = await sessionJar(env, store);
  let created = await createZcreditSession(jar, {
    resid: quote.resid,
    amount: quote.amount,
    invoiceName: quote.invoiceName || booking.guest_name || '',
    email: booking.guest_email || ''
  });
  let activeJar = jar;
  if (created.login) {
    activeJar = new Map();
    await kinorotLogin(activeJar, user, pass);
    created = await createZcreditSession(activeJar, {
      resid: quote.resid,
      amount: quote.amount,
      invoiceName: quote.invoiceName || booking.guest_name || '',
      email: booking.guest_email || ''
    });
  }
  await store.saveJar(activeJar);
  if (!created?.iframeUrl) {
    const err = new Error('ZCREDIT_CREATE_FAILED');
    err.code = 'ZCREDIT_CREATE_FAILED';
    throw err;
  }
  return { quote, iframeUrl: created.iframeUrl, skipped: false };
}

export async function completeKinorotCheckin(booking, env, store) {
  const quote = await quoteKinorotCheckin(booking, env, store);
  if (!quote.available || !quote.needsCharge) {
    return { quote, paid: true };
  }
  return { quote, paid: false };
}
