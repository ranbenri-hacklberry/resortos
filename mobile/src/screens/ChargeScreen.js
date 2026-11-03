import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { runTapCharge } from '../../../functions/lib/cardcomTapFlow.js';
import { createPaymentsApi, nativeTap, paymentsMode, tapOnThisPhone } from '../lib/payments';

const DEMO = paymentsMode !== 'live';
const SESSION_KEY = 'resortos.tap.session';

export default function ChargeScreen({ preset, onClose }) {
  const api = useMemo(() => createPaymentsApi(), []);
  const [amount, setAmount] = useState(preset?.amount ? String(preset.amount) : '');
  const [payments, setPayments] = useState(Number(preset?.payments) || 1);
  const [bookingId, setBookingId] = useState(preset?.bookingId || '');
  const [phase, setPhase] = useState('form');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const showTap = tapOnThisPhone();

  React.useEffect(() => {
    if (!preset) return;
    if (preset.amount) setAmount(String(preset.amount));
    if (preset.payments) setPayments(Number(preset.payments) || 1);
    if (preset.bookingId) setBookingId(preset.bookingId);
    setPhase('form');
    setResult(null);
    setError('');
  }, [preset?.nonce, preset?.amount, preset?.bookingId, preset?.payments]);

  const changePayments = (delta) => {
    setPayments((current) => Math.min(12, Math.max(1, current + delta)));
  };

  const onTap = async () => {
    setError('');
    setResult(null);
    const tap = nativeTap();
    if (!tap) {
      setError('הצמדת כרטיס קיימת רק באנדרואיד.');
      return;
    }
    setPhase('tap');
    try {
      const profile = await tap.deviceProfile();
      if (!profile.mock && (!profile.android13 || !profile.nfc)) {
        setPhase('form');
        setError('המכשיר צריך אנדרואיד 13 ו-NFC פתוח. אפשר לשלוח קישור במקום.');
        return;
      }
      const outcome = await runTapCharge({
        api,
        tap: {
          deviceProfile: () => tap.deviceProfile(),
          loadSession: async () => {
            const raw = await AsyncStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
          },
          saveSession: async (session) => {
            await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({
              tpn: session.tpn,
              merchantCode: session.merchantCode,
              sapakMutavNumber: session.sapakMutavNumber,
              ravMutavTerminalNumber: session.ravMutavTerminalNumber,
              sessionKey: session.sessionKey
            }));
          },
          registerDevice: (tpn, merchantCode) => tap.registerDevice(tpn, merchantCode),
          performTransaction: async (input, sessionKey) => tap.performTransaction(JSON.stringify(input), sessionKey)
        },
        amount: Number(String(amount).replace(',', '.')),
        payments,
        bookingId: bookingId.trim()
      });
      if (!outcome?.ok) {
        setPhase('form');
        setError(outcome?.message || 'החיוב לא הושלם');
        return;
      }
      setResult(outcome);
      setPhase('done');
    } catch (err) {
      setPhase('form');
      setError(err?.message || 'החיוב לא הושלם');
    }
  };

  const onLink = async () => {
    setError('');
    const key = await api.createKey();
    const link = await api.link({
      amount: Number(String(amount).replace(',', '.')),
      payments,
      bookingId: bookingId.trim(),
      idempotencyKey: key
    });
    if (!link?.ok) {
      setError(link?.message || 'לא נוצר קישור');
      return;
    }
    await Share.share({
      message: `תשלום למיאליס: ${link.amount} ₪\n${link.url}`
    });
  };

  const onManual = async () => {
    setError('');
    setPhase('tap');
    const key = await api.createKey();
    const charged = await api.manual({
      amount: Number(String(amount).replace(',', '.')),
      payments,
      bookingId: bookingId.trim(),
      idempotencyKey: key,
      cardNumber,
      expiry,
      cvv
    });
    if (!charged?.ok) {
      setPhase('form');
      setError(charged?.message || 'הכרטיס לא אושר');
      return;
    }
    setResult(charged);
    setPhase('done');
    setCardNumber('');
    setCvv('');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {onClose ? (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="חזרה לדשבורד" style={styles.back}>
          <Text style={styles.backText}>חזרה לדשבורד</Text>
        </Pressable>
      ) : null}
      <Text style={styles.kicker}>מיאליס</Text>
      <Text style={styles.title}>חיוב</Text>
      {DEMO ? <Text style={styles.banner}>מצב הדגמה. לא נגבה כסף אמיתי.</Text> : null}
      {bookingId ? <Text style={styles.booking}>הזמנה {bookingId}</Text> : <Text style={styles.booking}>בלי קישור להזמנה</Text>}

      <Text style={styles.label}>סכום</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#94a3b8"
        style={styles.amount}
        textAlign="right"
      />

      <Text style={styles.label}>תשלומים</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.step} onPress={() => changePayments(1)}><Text style={styles.stepText}>+</Text></Pressable>
        <Text style={styles.stepValue}>{payments}</Text>
        <Pressable style={styles.step} onPress={() => changePayments(-1)}><Text style={styles.stepText}>−</Text></Pressable>
      </View>
      {Number(String(amount).replace(',', '.')) > 300 && showTap ? (
        <Text style={styles.warn}>כרטיס פיזי מוגבל ל-300 ש״ח. מעל זה שלחו קישור.</Text>
      ) : null}

      {phase === 'tap' ? (
        <View style={styles.wait}>
          <ActivityIndicator color="#1b365d" size="large" />
          <Text style={styles.waitText}>הצמידו את הכרטיס לגב הטלפון</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {phase === 'done' && result ? (
        <View style={styles.ok}>
          <Text style={styles.okTitle}>{result.message || 'החיוב נקלט'}</Text>
          <Text style={styles.okDeal}>עסקה {result.dealNumber}</Text>
          {result.documentNumber ? <Text style={styles.okDeal}>חשבונית {result.documentNumber}</Text> : null}
          <Pressable style={styles.secondary} onPress={() => { setPhase('form'); setResult(null); setAmount(''); }}>
            <Text style={styles.secondaryText}>חיוב נוסף</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          {showTap ? (
            <Pressable style={styles.primary} onPress={onTap} disabled={phase === 'tap'}>
              <Text style={styles.primaryText}>חיוב בכרטיס</Text>
            </Pressable>
          ) : (
            <Text style={styles.note}>באייפון אין הצמדת כרטיס. שולחים קישור, או מקלידים את הכרטיס.</Text>
          )}
          <Pressable style={styles.secondary} onPress={onLink}>
            <Text style={styles.secondaryText}>שליחת קישור לאורח</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setManual((open) => !open)}>
            <Text style={styles.secondaryText}>הקלדת כרטיס</Text>
          </Pressable>
        </View>
      )}

      {manual && phase !== 'done' ? (
        <View style={styles.manual}>
          <TextInput value={cardNumber} onChangeText={setCardNumber} keyboardType="number-pad" placeholder="מספר כרטיס" placeholderTextColor="#94a3b8" style={styles.input} textAlign="right" />
          <View style={styles.row}>
            <TextInput value={cvv} onChangeText={setCvv} keyboardType="number-pad" placeholder="CVV" placeholderTextColor="#94a3b8" style={[styles.input, styles.half]} textAlign="right" />
            <TextInput value={expiry} onChangeText={setExpiry} keyboardType="number-pad" placeholder="תוקף MM/YY" placeholderTextColor="#94a3b8" style={[styles.input, styles.half]} textAlign="right" />
          </View>
          <Pressable style={styles.primary} onPress={onManual}>
            <Text style={styles.primaryText}>חיוב בהקלדה</Text>
          </Pressable>
          <Text style={styles.note}>המספר נשלח לשרת ולא נשמר בטלפון.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const font = 'sans-serif';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#eaecf0' },
  page: { padding: 16, paddingBottom: 40, backgroundColor: '#eaecf0' },
  back: { alignSelf: 'flex-start', marginBottom: 10 },
  backText: { color: '#1b365d', fontFamily: font, fontSize: 15, fontWeight: '800' },
  kicker: { color: '#1b365d', fontFamily: font, fontWeight: '800', fontSize: 13 },
  title: { fontFamily: font, fontSize: 28, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  banner: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    padding: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#94a3b8',
    overflow: 'hidden',
    fontFamily: font,
    fontWeight: '700'
  },
  booking: { marginTop: 12, fontFamily: font, fontSize: 15, color: '#64748b' },
  label: { marginTop: 16, fontFamily: font, fontSize: 14, fontWeight: '800', color: '#0f172a' },
  amount: {
    marginTop: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#94a3b8',
    fontFamily: font,
    fontSize: 32,
    fontWeight: '800',
    color: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  stepper: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  step: {
    width: 48,
    height: 48,
    borderRadius: 2,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#94a3b8'
  },
  stepText: { fontFamily: font, fontSize: 24, fontWeight: '800', color: '#1b365d' },
  stepValue: { flex: 1, textAlign: 'center', fontFamily: font, fontSize: 28, fontWeight: '800', color: '#0f172a' },
  warn: { marginTop: 10, color: '#b45309', fontFamily: font, fontWeight: '700' },
  actions: { marginTop: 20, gap: 8 },
  primary: { backgroundColor: '#1b365d', borderRadius: 2, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#f8fafc', fontFamily: font, fontSize: 18, fontWeight: '800' },
  secondary: {
    backgroundColor: '#f8fafc',
    borderRadius: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#94a3b8'
  },
  secondaryText: { color: '#1b365d', fontFamily: font, fontSize: 16, fontWeight: '800' },
  note: { color: '#64748b', fontFamily: font, fontSize: 14, lineHeight: 20 },
  error: { marginTop: 12, color: '#b91c1c', fontFamily: font, fontSize: 15, fontWeight: '800' },
  wait: { marginTop: 20, alignItems: 'center', gap: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#94a3b8', borderRadius: 2, padding: 16 },
  waitText: { fontFamily: font, fontSize: 16, fontWeight: '800', color: '#0f172a' },
  ok: { marginTop: 20, backgroundColor: '#f8fafc', borderRadius: 2, borderWidth: 1, borderColor: '#94a3b8', padding: 14, gap: 6 },
  okTitle: { fontFamily: font, fontSize: 20, fontWeight: '800', color: '#1b365d' },
  okDeal: { fontFamily: font, fontSize: 16, color: '#0f172a', fontWeight: '700' },
  manual: { marginTop: 14, gap: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#94a3b8', borderRadius: 2, padding: 12 },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#94a3b8',
    padding: 12,
    fontFamily: font,
    fontSize: 16,
    color: '#0f172a'
  },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 }
});
