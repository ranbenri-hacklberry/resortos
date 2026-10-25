import React from 'react';
import ReactDOM from 'react-dom/client';
import './guest.css';
import './i18n';
import DemoCheckoutBoot from './components/DemoCheckoutBoot.jsx';
import GuestCheckout from './components/GuestCheckout.jsx';
import GuestStayPreview from './components/GuestStayPreview.jsx';
import GuestWhatsappBridge from './components/GuestWhatsappBridge.jsx';
import { applyGuestTheme, readGuestTheme } from './lib/guestTheme';
import { isGuestDemoPath, isGuestFormDemoPath, resolveStayToken } from './lib/stayToken';

const isFormDemo = isGuestFormDemoPath();
const isStayDemo = !isFormDemo && isGuestDemoPath();
const token = isStayDemo || isFormDemo ? '' : resolveStayToken();
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const unitParam = urlParams.get('unit');
const isRoomQrScan = Boolean(unitParam && !token && !isStayDemo && !isFormDemo);

if (isStayDemo || isFormDemo) {
  const url = new URL(window.location.href);
  if (url.searchParams.has('token')) {
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url);
  }
} else if (token) {
  const url = new URL(window.location.href);
  const pathHasToken = /\/(?:stay|checkout)\/tok_/i.test(url.pathname);
  if (!pathHasToken && !url.searchParams.get('token')) {
    url.searchParams.set('token', token);
    window.history.replaceState({}, '', url);
  }
}

const theme = readGuestTheme('light');
applyGuestTheme(theme);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isFormDemo ? (
      <DemoCheckoutBoot theme={theme} />
    ) : isStayDemo ? (
      <GuestStayPreview theme={theme} />
    ) : isRoomQrScan ? (
      <GuestWhatsappBridge unitId={unitParam} />
    ) : (
      <GuestCheckout token={token} theme={theme} />
    )}
  </React.StrictMode>
);
