import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { getToken, getUser, saveSession } from '../api';
import { colors, DASHBOARD_URL } from '../config';

function bridgeScript(token, user) {
  return `
    (function () {
      try {
        var token = ${JSON.stringify(token || '')};
        var user = ${JSON.stringify(user || '')};
        if (token) localStorage.setItem('resortos_dashboard_token_v1', token);
        if (user) localStorage.setItem('resortos_dashboard_user_v1', user);
      } catch (e) {}
      if (window.__resortosBridge) return true;
      window.__resortosBridge = true;
      function send(payload) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
      }
      function session() {
        try {
          send({
            type: 'session',
            token: localStorage.getItem('resortos_dashboard_token_v1') || '',
            user: localStorage.getItem('resortos_dashboard_user_v1') || ''
          });
        } catch (e) {}
      }
      window.ResortOSNative = {
        charge: function (payload) { send({ type: 'charge', payload: payload || {} }); }
      };
      session();
      setInterval(session, 2500);
      return true;
    })();
    true;
  `;
}

export default function DashboardScreen({ navigation }) {
  const [token, setToken] = useState('');
  const [user, setUser] = useState('');
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      const [savedToken, savedUser] = await Promise.all([getToken(), getUser()]);
      if (!active) return;
      setToken(savedToken);
      setUser(savedUser ? JSON.stringify(savedUser) : '');
      setReady(true);
    })();
    return () => { active = false; };
  }, []));

  const onMessage = async (event) => {
    let data = {};
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (data.type === 'session' && data.token) {
      let parsed = data.user;
      try { parsed = JSON.parse(data.user); } catch { /* keep string */ }
      await saveSession(data.token, parsed || data.user || '');
      setToken(data.token);
    }
    if (data.type === 'charge') {
      navigation.navigate('Charge', data.payload || {});
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bar}>
        <Text style={styles.title}>דשבורד</Text>
        <Pressable style={styles.charge} onPress={() => navigation.navigate('Charge')}>
          <Text style={styles.chargeText}>חיוב</Text>
        </Pressable>
        <Pressable onPress={() => setKey((n) => n + 1)}>
          <Text style={styles.refresh}>רענון</Text>
        </Pressable>
      </View>
      {ready ? (
        <WebView
          key={key}
          source={{ uri: DASHBOARD_URL }}
          style={styles.web}
          injectedJavaScriptBeforeContentLoaded={bridgeScript(token, user)}
          injectedJavaScript={bridgeScript(token, user)}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.loadingText}>טוען את הדשבורד…</Text>
            </View>
          )}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.gold} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bg
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'right' },
  charge: { backgroundColor: colors.ink, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10 },
  chargeText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  refresh: { color: colors.gold, fontSize: 16, fontWeight: '700' },
  web: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: colors.gold, fontWeight: '800', fontSize: 18 }
});
