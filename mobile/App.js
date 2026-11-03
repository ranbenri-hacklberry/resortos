import React, { useEffect, useState } from 'react';
import { Dimensions, Linking, Platform, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { parseChargeLink } from '../functions/lib/cardcomTapCore.js';
import DashboardScreen from './src/screens/DashboardScreen';
import ChargeScreen from './src/screens/ChargeScreen';

const FAB = 56;

function systemBottomInset() {
  const screen = Dimensions.get('screen');
  const window = Dimensions.get('window');
  const status = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const overlap = Math.round(screen.height - window.height - status);
  if (overlap > 0 && overlap < 80) return overlap;
  if (Platform.OS === 'ios' && window.height >= 812) return 34;
  return 0;
}

function CardIcon() {
  return (
    <View style={styles.card} accessibilityElementsHidden>
      <View style={styles.cardStripe} />
      <View style={styles.cardChip} />
    </View>
  );
}

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

  const bottomInset = systemBottomInset();
  const fabClearance = bottomInset + FAB + 28;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#eaecf0" />
      <View style={styles.body}>
        {tab === 'dashboard' ? (
          <DashboardScreen onOpenCharge={openCharge} contentInsetBottom={fabClearance} />
        ) : (
          <ChargeScreen preset={preset} onClose={() => setTab('dashboard')} />
        )}
      </View>
      {tab === 'dashboard' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חיוב"
          onPress={() => openCharge({})}
          style={[styles.fab, { bottom: bottomInset + 16 }]}
        >
          <CardIcon />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eaecf0', paddingTop: StatusBar.currentHeight || 0 },
  body: { flex: 1 },
  fab: {
    position: 'absolute',
    start: 16,
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: '#1b365d',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }
  },
  card: {
    width: 26,
    height: 18,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#f8fafc',
    overflow: 'hidden',
    justifyContent: 'space-between'
  },
  cardStripe: { height: 4, backgroundColor: '#f8fafc', marginTop: 3 },
  cardChip: {
    width: 6,
    height: 4,
    marginBottom: 3,
    marginStart: 3,
    borderRadius: 1,
    backgroundColor: '#f8fafc'
  }
});
