const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SESSION_KEY = 'resortos-review-google-user';

export function googleClientId() {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
}

export function readGoogleUser() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (raw && raw.sub) return raw;
  } catch (_) {}
  return null;
}

export function saveGoogleUser(user) {
  if (!user) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export function logoutGoogleUser() {
  saveGoogleUser(null);
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('google-script'));
    document.head.appendChild(script);
  });
}

function parseJwt(credential) {
  const part = String(credential || '').split('.')[1];
  if (!part) return null;
  const json = decodeURIComponent(
    atob(part.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
  );
  return JSON.parse(json);
}

export async function loadGoogleIdentity() {
  await loadScript(GIS_SRC);
  return window.google;
}

export async function renderGoogleButton(element, { onUser, onError, theme = 'outline' }) {
  const clientId = googleClientId();
  if (!clientId) {
    onError?.('missing-client-id');
    return;
  }
  const google = await loadGoogleIdentity();
  google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: 'popup',
    callback: (response) => {
      try {
        const payload = parseJwt(response.credential);
        if (!payload?.sub) throw new Error('bad-token');
        const user = {
          sub: payload.sub,
          email: payload.email || '',
          name: payload.name || payload.email || 'משתמש Google',
          picture: payload.picture || ''
        };
        saveGoogleUser(user);
        onUser?.(user);
      } catch (err) {
        onError?.(err);
      }
    }
  });
  element.innerHTML = '';
  google.accounts.id.renderButton(element, {
    theme,
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
    locale: 'he',
    width: 320
  });
}
