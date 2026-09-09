export function isAndroidInAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const s = String(ua || '').toLowerCase();
  if (!/android/.test(s)) return false;
  return /; wv\)|whatsapp|instagram|fbav|fban|fb_iab|gsa\/|line\/|tiktok|musical_ly|bytedance/.test(s);
}

export function isInAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const s = String(ua || '').toLowerCase();
  if (/whatsapp|instagram|fbav|fban|fb_iab|line\/|tiktok|musical_ly|bytedance/.test(s)) return true;
  return isAndroidInAppBrowser(ua);
}

export function listenHypParentBreakout(onHref) {
  if (typeof window === 'undefined' || typeof onHref !== 'function') return () => {};
  function onMsg(event) {
    if (!event?.data || event.data.type !== 'resortos-hyp') return;
    const href = String(event.data.href || '');
    if (!href) return;
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      onHref(url.toString());
    } catch (_) {}
  }
  window.addEventListener('message', onMsg);
  return () => window.removeEventListener('message', onMsg);
}

export function shouldEmbedHypPayment() {
  return false;
}

export function isAndroidChrome(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const s = String(ua || '').toLowerCase();
  return /android/.test(s) && /chrome\//.test(s) && !isAndroidInAppBrowser(s);
}

export function chromeIntentUrl(url) {
  try {
    const u = new URL(url, typeof location === 'undefined' ? 'https://resortos.app' : location.href);
    const fallback = encodeURIComponent(u.href);
    return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  } catch (_) {
    return url;
  }
}

export function openPaymentUrl(url) {
  if (!url) return;
  if (typeof window !== 'undefined' && isAndroidInAppBrowser()) {
    window.location.assign(chromeIntentUrl(url));
    return;
  }
  window.location.assign(url);
}
