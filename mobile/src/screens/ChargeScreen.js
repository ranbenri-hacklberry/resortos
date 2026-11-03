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
    <View style={styles.screen}>
      <View style={styles.header}>
        {onClose ? (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="חזרה" style={styles.back}>
            <Text style={styles.chevron}>›</Text>
            <Text style={styles.backText}>חזרה</Text>
          </Pressable>
        ) : <View />}
        <Text style={styles.headerTitle}>סליקת אשראי</Text>
      </View>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.master}>
          <View style={styles.col}>
            <Text style={styles.colTitle}>פרטי חיוב</Text>
            {DEMO ? <Text style={styles.note}>מצב הדגמה. לא נגבה כסף אמיתי.</Text> : null}
            <Text style={styles.label}>הזמנה</Text>
            <Text style={styles.value}>{bookingId || 'בלי קישור להזמנה'}</Text>
            <Text style={styles.label}>סכום</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              textAlign="right"
            />
            <Text style={styles.label}>תשלומים</Text>
            <View style={styles.stepper}>
              <Pressable style={styles.step} onPress={() => changePayments(1)} accessibilityLabel="הוספת תשלום"><Text style={styles.stepText}>+</Text></Pressable>
              <Text style={styles.stepValue}>{payments}</Text>
              <Pressable style={styles.step} onPress={() => changePayments(-1)} accessibilityLabel="הפחתת תשלום"><Text style={styles.stepText}>−</Text></Pressable>
            </View>
            {Number(String(amount).replace(',', '.')) > 300 && showTap ? (
              <Text style={styles.warn}>כרטיס פיזי מוגבל ל-300 ש״ח. מעל זה שלחו קישור.</Text>
            ) : null}
          </View>
        </View>

        {phase === 'tap' ? (
          <View style={styles.wait}>
            <ActivityIndicator color="#1b365d" size="small" />
            <Text style={styles.waitText}>הצמידו את הכרטיס לגב הטלפון</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {phase === 'done' && result ? (
          <View style={styles.master}>
            <View style={styles.col}>
              <Text style={styles.colTitle}>{result.message || 'החיוב נקלט'}</Text>
              <Text style={styles.value}>עסקה {result.dealNumber}</Text>
              {result.documentNumber ? <Text style={styles.value}>חשבונית {result.documentNumber}</Text> : null}
              <Pressable style={styles.secondary} onPress={() => { setPhase('form'); setResult(null); setAmount(''); }}>
                <Text style={styles.secondaryText}>חיוב נוסף</Text>
              </Pressable>
            </View>
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
          <View style={styles.master}>
            <View style={styles.col}>
              <Text style={styles.colTitle}>הקלדת כרטיס</Text>
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
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const font = 'sans-serif';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#eaecf0' },
  header: {
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#94a3b8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 26, paddingStart: 8 },
  chevron: { color: '#1b365d', fontFamily: font, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  backText: { color: '#1b365d', fontFamily: font, fontSize: 13, fontWeight: '700' },
  headerTitle: { color: '#1b365d', fontFamily: font, fontSize: 13, fontWeight: '800' },
  page: { padding: 6, paddingBottom: 28, gap: 6, backgroundColor: '#eaecf0' },
  master: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 6,
    padding: 8
  },
  col: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    padding: 8,
    gap: 4
  },
  colTitle: {
    fontFamily: font,
    fontSize: 12,
    fontWeight: '800',
    color: '#1b365d',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 4,
    marginBottom: 2
  },
  label: { fontFamily: font, fontSize: 11, fontWeight: '600', color: '#334155' },
  value: { fontFamily: font, fontSize: 13, fontWeight: '700', color: '#0f172a' },
  input: {
    height: 26,
    backgroundColor: '#fff',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#94a3b8',
    fontFamily: font,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    paddingHorizontal: 4,
    paddingVertical: 0
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: {
    width: 28,
    height: 26,
    borderRadius: 0,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#94a3b8'
  },
  stepText: { fontFamily: font, fontSize: 13, fontWeight: '700', color: '#0f172a' },
  stepValue: { flex: 1, textAlign: 'center', fontFamily: font, fontSize: 13, fontWeight: '800', color: '#1b365d' },
  warn: { color: '#b45309', fontFamily: font, fontSize: 11, fontWeight: '700' },
  actions: { gap: 6 },
  primary: {
    backgroundColor: '#1b365d',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#0f2942',
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryText: { color: '#f8fafc', fontFamily: font, fontSize: 13, fontWeight: '800' },
  secondary: {
    backgroundColor: '#f8fafc',
    borderRadius: 0,
    minHeight: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#94a3b8'
  },
  secondaryText: { color: '#1b365d', fontFamily: font, fontSize: 13, fontWeight: '700' },
  note: { color: '#64748b', fontFamily: font, fontSize: 11, lineHeight: 16 },
  error: { color: '#b91c1c', fontFamily: font, fontSize: 12, fontWeight: '800' },
  wait: {
    minHeight: 29,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 4,
    padding: 8
  },
  waitText: { fontFamily: font, fontSize: 12, fontWeight: '700', color: '#0f172a' },
  row: { flexDirection: 'row', gap: 6 },
  half: { flex: 1 }
});
