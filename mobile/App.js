import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { parseChargeLink } from '../functions/lib/cardcomTapCore.js';
import DashboardScreen from './src/screens/DashboardScreen';
import ChargeScreen from './src/screens/ChargeScreen';

function presetFromUrl(url) {
  const link = parseChargeLink(url);
  if (!link) return null;
  return {
    nonce: Date.now(),
    bookingId: link.bookingId,
    amount: link.amount != null ? String(link.amount) : '',
    payments: String(link.payments || 1)
  };
}

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [preset, setPreset] = useState(null);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const next = presetFromUrl(url);
      if (!next) return;
      setPreset(next);
      setTab('charge');
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const next = presetFromUrl(url);
      if (!next) return;
      setPreset(next);
      setTab('charge');
    });
    return () => sub.remove();
  }, []);

  const openCharge = (next) => {
    setPreset({ nonce: Date.now(), ...next });
    setTab('charge');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#eaecf0" />
      <View style={styles.body}>
        {tab === 'dashboard' ? <DashboardScreen onOpenCharge={openCharge} /> : <ChargeScreen preset={preset} />}
      </View>
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'dashboard' && styles.tabOn]} onPress={() => setTab('dashboard')}>
          <Text style={[styles.tabText, tab === 'dashboard' && styles.tabTextOn]}>דשבורד</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'charge' && styles.tabOn]} onPress={() => setTab('charge')}>
          <Text style={[styles.tabText, tab === 'charge' && styles.tabTextOn]}>חיוב</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eaecf0', paddingTop: StatusBar.currentHeight || 0 },
  body: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    backgroundColor: '#f8fafc'
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabOn: { backgroundColor: '#1b365d' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  tabTextOn: { color: '#f8fafc' }
});
