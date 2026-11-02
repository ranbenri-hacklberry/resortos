import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseChargeLink } from '../../../functions/lib/cardcomTapCore.js';
import { dashboardUrl, setSessionToken } from '../lib/payments';

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

export default function DashboardScreen({ onOpenCharge }) {
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
          <ActivityIndicator color="#C5A059" />
          <Text style={styles.bootText}>טוען את הדשבורד…</Text>
        </View>
      ) : null}
      <WebView
        source={{ uri: dashboardUrl }}
        style={styles.web}
        onLoadEnd={() => setReady(true)}
        injectedJavaScriptBeforeContentLoaded={BRIDGE}
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
  wrap: { flex: 1, backgroundColor: '#FAF8F3' },
  web: { flex: 1, backgroundColor: '#FAF8F3' },
  boot: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF8F3'
  },
  bootText: { marginTop: 12, color: '#C5A059', fontWeight: '800', fontSize: 18 }
});
