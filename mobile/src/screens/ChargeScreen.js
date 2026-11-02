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

export default function ChargeScreen({ preset }) {
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
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
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
        placeholderTextColor="#B7A89A"
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
          <ActivityIndicator color="#10A37F" size="large" />
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
          <TextInput value={cardNumber} onChangeText={setCardNumber} keyboardType="number-pad" placeholder="מספר כרטיס" placeholderTextColor="#B7A89A" style={styles.input} textAlign="right" />
          <View style={styles.row}>
            <TextInput value={cvv} onChangeText={setCvv} keyboardType="number-pad" placeholder="CVV" placeholderTextColor="#B7A89A" style={[styles.input, styles.half]} textAlign="right" />
            <TextInput value={expiry} onChangeText={setExpiry} keyboardType="number-pad" placeholder="תוקף MM/YY" placeholderTextColor="#B7A89A" style={[styles.input, styles.half]} textAlign="right" />
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

const styles = StyleSheet.create({
  page: { padding: 22, paddingBottom: 48, backgroundColor: '#FAF8F3' },
  kicker: { color: '#C5A059', fontWeight: '800', fontSize: 14 },
  title: { fontSize: 40, fontWeight: '900', color: '#26130F', marginTop: 4 },
  banner: { marginTop: 10, backgroundColor: '#F3E6C8', color: '#26130F', padding: 10, borderRadius: 12, overflow: 'hidden', fontWeight: '700' },
  booking: { marginTop: 14, fontSize: 16, color: '#6B5C53' },
  label: { marginTop: 22, fontSize: 16, fontWeight: '800', color: '#26130F' },
  amount: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7DFD4',
    fontSize: 42,
    fontWeight: '900',
    color: '#26130F',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  stepper: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  step: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E7DFD4' },
  stepText: { fontSize: 32, fontWeight: '800', color: '#26130F' },
  stepValue: { flex: 1, textAlign: 'center', fontSize: 36, fontWeight: '900', color: '#26130F' },
  warn: { marginTop: 10, color: '#9B2335', fontWeight: '700' },
  actions: { marginTop: 28, gap: 12 },
  primary: { backgroundColor: '#10A37F', borderRadius: 18, paddingVertical: 18, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  secondary: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E7DFD4' },
  secondaryText: { color: '#26130F', fontSize: 18, fontWeight: '800' },
  note: { color: '#6B5C53', fontSize: 15, lineHeight: 22 },
  error: { marginTop: 16, color: '#9B2335', fontSize: 16, fontWeight: '800' },
  wait: { marginTop: 28, alignItems: 'center', gap: 12 },
  waitText: { fontSize: 20, fontWeight: '800', color: '#26130F' },
  ok: { marginTop: 28, backgroundColor: '#E7F6F1', borderRadius: 18, padding: 18, gap: 8 },
  okTitle: { fontSize: 24, fontWeight: '900', color: '#0D8A6A' },
  okDeal: { fontSize: 18, color: '#26130F', fontWeight: '700' },
  manual: { marginTop: 18, gap: 10 },
  input: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E7DFD4', padding: 14, fontSize: 18, color: '#26130F' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 }
});
