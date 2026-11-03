import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseChargeLink } from '../../../functions/lib/cardcomTapCore.js';
import { dashboardUrl, setSessionToken } from '../lib/payments';

const PHONE_FIT = `
(function () {
  var root = document.documentElement;
  root.classList.add('resortos-app');
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
  var style = document.createElement('style');
  style.setAttribute('data-resortos-phone', '1');
  style.textContent = [
    'html.resortos-app { font-size: 15px !important; -webkit-text-size-adjust: 100% !important; }',
    'html.resortos-app .priority-root.is-phone .priority-status { display: none !important; }',
    'html.resortos-app .priority-root.is-phone .priority-toolbar { display: none !important; }',
    'html.resortos-app .priority-root.is-phone .priority-title { display: none !important; }',
    'html.resortos-app .priority-root.is-phone .week-table { min-width: 0 !important; width: 100% !important; table-layout: fixed !important; }',
    'html.resortos-app .priority-root.is-phone .week-table .unit-cell, html.resortos-app .priority-root.is-phone .week-table thead tr.occupancy-row th.occupancy-label, html.resortos-app .priority-root.is-phone .week-table thead tr.label-row th.unit-cell { position: static !important; right: auto !important; width: 42% !important; min-width: 0 !important; max-width: none !important; }',
    'html.resortos-app .priority-root.is-phone .week-table .week-cell, html.resortos-app .priority-root.is-phone .week-table thead th.is-today { width: auto !important; min-width: 0 !important; }',
    'html.resortos-app .priority-root.is-phone .phone-day-switch { max-width: 100%; }',
    'html.resortos-app .priority-root.is-phone .phone-day-switch button { min-width: 22px !important; height: 22px !important; font-size: 13px !important; }',
    'html.resortos-app header { padding: 6px 8px !important; }',
    'html.resortos-app button[style*="#C5A059"], html.resortos-app button[style*="linear-gradient(135deg, #C5A059"] { background: #1b365d !important; color: #f8fafc !important; border-color: #0f2942 !important; box-shadow: none !important; border-radius: 2px !important; }',
    'html.resortos-app .mobile-ops-view, html.resortos-app .hotelos-ops-page, html.resortos-app .dashboard-finance, html.resortos-app .dashboard-chloe { background: #eaecf0 !important; color: #0f172a !important; font-family: Tahoma, "Segoe UI", Arial, sans-serif !important; }',
    'html.resortos-app [style*="#FAF8F3"], html.resortos-app [style*="#FDFBF7"] { background-color: #eaecf0 !important; }',
    'html.resortos-app [style*="border-radius: 16px"], html.resortos-app [style*="border-radius:16px"] { border-radius: 2px !important; }',
    'html.resortos-app #root > div { box-sizing: border-box !important; padding-bottom: __FAB_PAD__px !important; }'
  ].join('\\n');
  document.documentElement.appendChild(style);
})();
`;

const BRIDGE = `
(function () {
  function session() {
    var token = '';
    try { token = localStorage.getItem('resortos_dashboard_token_v1') || ''; } catch (e) {}
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'resortos-session', token: token }));
    }
  }
  window.ResortOSNative = {
    openCharge: function (payload) {
      var body = payload || {};
      body.type = 'resortos-charge';
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(body));
    }
  };
  session();
  setInterval(session, 2500);
})();
true;
`;

export default function DashboardScreen({ onOpenCharge, contentInsetBottom = 84 }) {
  const phoneFit = PHONE_FIT.replace('__FAB_PAD__', String(Math.max(72, Math.round(contentInsetBottom))));
  const [ready, setReady] = useState(false);

  const onMessage = (event) => {
    let data = null;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (data?.type === 'resortos-session') setSessionToken(data.token || '');
    if (data?.type === 'resortos-charge') {
      onOpenCharge({
        bookingId: String(data.booking || data.bookingId || ''),
        amount: data.amount != null ? String(data.amount) : '',
        payments: data.payments != null ? String(data.payments) : '1'
      });
    }
  };

  const onShouldStart = (request) => {
    const link = parseChargeLink(request.url);
    if (!link) return true;
    if (request.url.startsWith('resortos:') || request.url.includes('/app/charge')) {
      onOpenCharge({
        bookingId: link.bookingId,
        amount: link.amount != null ? String(link.amount) : '',
        payments: String(link.payments || 1)
      });
      return false;
    }
    return true;
  };

  return (
    <View style={styles.wrap}>
      {!ready ? (
        <View style={styles.boot}>
          <ActivityIndicator color="#1b365d" />
          <Text style={styles.bootText}>טוען את הדשבורד…</Text>
        </View>
      ) : null}
      <WebView
        source={{ uri: dashboardUrl }}
        style={styles.web}
        onLoadEnd={() => setReady(true)}
        textZoom={100}
        scalesPageToFit
        injectedJavaScriptBeforeContentLoaded={phoneFit + BRIDGE}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        setSupportMultipleWindows={false}
        applicationNameForUserAgent="ResortOSApp/1"
        pullToRefreshEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#eaecf0' },
  web: { flex: 1, backgroundColor: '#eaecf0' },
  boot: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eaecf0'
  },
  bootText: { marginTop: 12, color: '#1b365d', fontWeight: '800', fontSize: 15 }
});
