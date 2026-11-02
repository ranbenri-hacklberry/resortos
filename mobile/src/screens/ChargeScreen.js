import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { runTapCharge } from '../../../functions/lib/cardcomTapCore.js';
import {
  api,
  getDeviceUuid,
  getPendingCharge,
  getToken,
  loginWithPassword,
  sendOtp,
  setPendingCharge,
  verifyOtp
} from '../api';
import { createTapClient, deviceProfile, tapAvailability } from '../cardcom/tap';
import { colors } from '../config';

function newKey() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export default function ChargeScreen({ navigation, route }) {
  const params = route.params || {};
  const [amount, setAmount] = useState(params.amount != null ? String(params.amount) : '');
  const [payments, setPayments] = useState(Math.max(1, Number(params.payments) || 1));
  const [bookingId, setBookingId] = useState(params.booking ? String(params.booking) : '');
  const [guest, setGuest] = useState(null);
  const [authed, setAuthed] = useState(true);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deal, setDeal] = useState('');
  const [mode, setMode] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [pending, setPending] = useState(null);
  const availability = tapAvailability();
  // Mock builds simulate the tap, so an emulator without NFC can still run the flow.
  const canTap = Platform.OS === 'android'
    && availability.supported !== false
    && (availability.nfc !== false || availability.mock === true);

  useEffect(() => {
    if (params.amount != null && params.amount !== '') setAmount(String(params.amount));
    if (params.payments) setPayments(Math.max(1, Number(params.payments) || 1));
    if (params.booking) setBookingId(String(params.booking));
  }, [params.amount, params.payments, params.booking]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [token, saved] = await Promise.all([getToken(), getPendingCharge()]);
      if (!active) return;
      setAuthed(Boolean(token));
      if (saved?.stage === 'unknown') setPending(saved);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!bookingId || !authed) return undefined;
    let active = true;
    api('GET', `/api/payments/cardcom/booking?id=${encodeURIComponent(bookingId)}`).then((data) => {
      if (!active) return;
      if (data.unauthorized) setAuthed(false);
      if (data.ok) {
        setGuest(data);
        if (!params.amount) setAmount(String(data.due_ils || ''));
      } else if (data.code === 'NOT_FOUND') {
        setGuest(null);
        setError('ההזמנה לא נמצאה');
      }
    });
    return () => { active = false; };
  }, [bookingId, authed, params.amount]);

  const clearCard = () => {
    setCardNumber('');
    setCvv('');
  };

  const onLogin = async () => {
    setBusy(true);
    setError('');
    const data = password
      ? await loginWithPassword(username || phone, password)
      : await verifyOtp(phone, otp, challenge);
    setBusy(false);
    if (!data.token) {
      setError(data.message || 'ההתחברות נכשלה');
      return;
    }
    setAuthed(true);
  };

  const onSendOtp = async () => {
    setError('');
    const data = await sendOtp(phone);
    if (!data.ok) setError(data.message || 'לא נשלח קוד');
    else {
      setChallenge(data.challenge || '');
      setMessage(data.message || 'הקוד נשלח');
    }
  };

  const chargeTap = async (reuse) => {
    setBusy(true);
    setError('');
    setMessage('');
    setDeal('');
    const key = reuse?.idempotencyKey || pending?.idempotencyKey || newKey();
    const payload = {
      idempotencyKey: key,
      bookingId: bookingId.trim(),
      amount: amount.trim(),
      payments,
      stage: 'charging'
    };
    await setPendingCharge(payload);
    setPending(payload);
    const uuid = await getDeviceUuid();
    const result = await runTapCharge({
      idempotencyKey: key,
      bookingId: bookingId.trim(),
      amount: amount.trim(),
      payments,
      customerName: guest?.guest_name || '',
      device: deviceProfile(uuid),
      tap: createTapClient(),
      call: (method, path, body) => api(method, path, body)
    });
    setBusy(false);
    if (result.unauthorized) setAuthed(false);
    if (result.ok) {
      await setPendingCharge(null);
      setPending(null);
      setDeal(result.dealNumber || '');
      setMessage(result.replay ? 'החיוב כבר נקלט' : 'החיוב נקלט');
      return;
    }
    if (result.doNotChargeAgain) {
      const next = { ...payload, stage: 'unknown' };
      await setPendingCharge(next);
      setPending(next);
    } else {
      await setPendingCharge(null);
      setPending(null);
    }
    setError(result.message || 'החיוב לא הושלם');
  };

  const checkLink = async () => {
    if (!pending?.idempotencyKey || pending.channel !== 'link') {
      setError('קודם שולחים קישור');
      return;
    }
    setBusy(true);
    const data = await api('POST', '/api/payments/cardcom/link-status', { idempotencyKey: pending.idempotencyKey });
    setBusy(false);
    if (data.ok) {
      setDeal(data.dealNumber || '');
      setMessage('התשלום בקישור נקלט');
      await setPendingCharge(null);
    } else setError(data.message || 'עוד אין תשלום');
  };

  const chargeManual = async () => {
    setBusy(true);
    setError('');
    const data = await api('POST', '/api/payments/cardcom/manual', {
      idempotencyKey: newKey(),
      bookingId: bookingId.trim(),
      amount: amount.trim(),
      payments,
      cardNumber,
      expMonth,
      expYear,
      cvv,
      holderName: guest?.guest_name || ''
    });
    clearCard();
    setBusy(false);
    if (data.unauthorized) setAuthed(false);
    if (data.ok) {
      setDeal(data.dealNumber || '');
      setMessage(`החיוב נקלט${data.last4 ? ` · כרטיס ${data.last4}` : ''}`);
      setMode('');
    } else {
      setError(data.message || 'הכרטיס לא חויב');
    }
  };

  const shareLinkAndRemember = async () => {
    const key = newKey();
    setBusy(true);
    setError('');
    const data = await api('POST', '/api/payments/cardcom/link', {
      idempotencyKey: key,
      bookingId: bookingId.trim(),
      amount: amount.trim(),
      payments
    });
    setBusy(false);
    if (!data.payUrl) {
      setError(data.message || 'לא נוצר קישור');
      return;
    }
    const next = { idempotencyKey: key, channel: 'link', stage: 'link', amount, payments, bookingId };
    await setPendingCharge(next);
    setPending(next);
    setMessage('הקישור מוכן. אחרי שהאורח משלם, לחצו על בדיקה.');
    await Share.share({ message: data.payUrl });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bar}>
        <Pressable onPress={() => navigation.navigate('Dashboard')}>
          <Text style={styles.back}>דשבורד</Text>
        </Pressable>
        <Text style={styles.title}>חיוב</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {guest ? (
          <View style={styles.card}>
            <Text style={styles.guest}>{guest.guest_name}</Text>
            <Text style={styles.meta}>יתרה {Number(guest.due_ils || 0).toFixed(2)} ש״ח</Text>
          </View>
        ) : null}

        <Text style={styles.label}>סכום בשקלים</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.muted}
          textAlign="right"
        />

        <Text style={styles.label}>מספר תשלומים</Text>
        <View style={styles.stepper}>
          <Pressable style={styles.step} onPress={() => setPayments((n) => Math.min(12, n + 1))}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
          <Text style={styles.payCount}>{payments}</Text>
          <Pressable style={styles.step} onPress={() => setPayments((n) => Math.max(1, n - 1))}>
            <Text style={styles.stepText}>-</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>הזמנה (לא חובה)</Text>
        <TextInput
          style={styles.input}
          value={bookingId}
          onChangeText={setBookingId}
          autoCapitalize="none"
          placeholder="מזהה הזמנה"
          placeholderTextColor={colors.muted}
          textAlign="right"
        />

        {!authed ? (
          <View style={styles.card}>
            <Text style={styles.guest}>התחברות צוות</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="טלפון" placeholderTextColor={colors.muted} textAlign="right" />
            <Pressable style={styles.secondary} onPress={onSendOtp}><Text style={styles.secondaryText}>שליחת קוד</Text></Pressable>
            <TextInput style={styles.input} value={otp} onChangeText={setOtp} keyboardType="number-pad" placeholder="קוד" placeholderTextColor={colors.muted} textAlign="right" />
            <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="שם משתמש" placeholderTextColor={colors.muted} textAlign="right" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="סיסמה" placeholderTextColor={colors.muted} textAlign="right" />
            <Pressable style={styles.primary} onPress={onLogin}><Text style={styles.primaryText}>כניסה</Text></Pressable>
          </View>
        ) : null}

        {canTap ? (
          <Pressable style={styles.primary} disabled={busy || !authed} onPress={() => chargeTap(pending?.stage === 'unknown' ? pending : null)}>
            <Text style={styles.primaryText}>{pending?.stage === 'unknown' ? 'בדיקה חוזרת' : 'חיוב בנגיעה'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.note}>
            {Platform.OS === 'ios'
              ? 'נגיעה בכרטיס זמינה רק בטלפון אנדרואיד. כאן שולחים קישור או מקלידים כרטיס.'
              : 'בטלפון הזה אין NFC פעיל. אפשר קישור או הקלדת כרטיס.'}
          </Text>
        )}

        {availability.mock && canTap ? <Text style={styles.note}>מצב הדגמה: הנגיעה מדומה עד שחבילת קרדקום תותקן.</Text> : null}
        {pending?.stage === 'unknown' ? <Text style={styles.warn}>יש חיוב שלא נסגר. אל תחייבו שוב.</Text> : null}

        <Pressable style={styles.secondary} disabled={busy || !authed} onPress={shareLinkAndRemember}>
          <Text style={styles.secondaryText}>שליחת קישור לאורח</Text>
        </Pressable>
        {pending?.channel === 'link' ? (
          <Pressable style={styles.secondary} disabled={busy} onPress={checkLink}>
            <Text style={styles.secondaryText}>בדיקה אם האורח שילם</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondary} onPress={() => setMode(mode === 'manual' ? '' : 'manual')}>
          <Text style={styles.secondaryText}>הקלדת כרטיס</Text>
        </Pressable>

        {mode === 'manual' ? (
          <View style={styles.card}>
            <TextInput style={styles.input} value={cardNumber} onChangeText={setCardNumber} keyboardType="number-pad" placeholder="מספר כרטיס" placeholderTextColor={colors.muted} textAlign="right" />
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.half]} value={expYear} onChangeText={setExpYear} keyboardType="number-pad" placeholder="שנה" placeholderTextColor={colors.muted} textAlign="right" />
              <TextInput style={[styles.input, styles.half]} value={expMonth} onChangeText={setExpMonth} keyboardType="number-pad" placeholder="חודש" placeholderTextColor={colors.muted} textAlign="right" />
            </View>
            <TextInput style={styles.input} value={cvv} onChangeText={setCvv} keyboardType="number-pad" placeholder="CVV" placeholderTextColor={colors.muted} textAlign="right" secureTextEntry />
            <Pressable style={styles.primary} disabled={busy || !authed} onPress={chargeManual}>
              <Text style={styles.primaryText}>חיוב הכרטיס</Text>
            </Pressable>
          </View>
        ) : null}

        {busy ? <ActivityIndicator color={colors.gold} /> : null}
        {message ? <Text style={styles.ok}>{message}{deal ? `\nעסקה ${deal}` : ''}</Text> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  title: { fontSize: 28, fontWeight: '900', color: colors.ink },
  back: { color: colors.gold, fontSize: 16, fontWeight: '800' },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  label: { fontSize: 16, fontWeight: '700', color: colors.muted, textAlign: 'right' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 22,
    color: colors.ink
  },
  stepper: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16 },
  step: { backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1, borderColor: colors.line },
  stepText: { fontSize: 28, fontWeight: '800', color: colors.ink },
  payCount: { fontSize: 28, fontWeight: '900', color: colors.ink, minWidth: 36, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.line },
  guest: { fontSize: 22, fontWeight: '900', color: colors.ink, textAlign: 'right' },
  meta: { fontSize: 16, color: colors.muted, textAlign: 'right' },
  primary: { backgroundColor: colors.ink, borderRadius: 16, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  secondary: { backgroundColor: colors.card, borderRadius: 16, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  note: { color: colors.muted, fontSize: 16, textAlign: 'right', lineHeight: 22 },
  warn: { color: colors.danger, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  ok: { color: colors.ok, fontSize: 20, fontWeight: '800', textAlign: 'right' },
  err: { color: colors.danger, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  row: { flexDirection: 'row-reverse', gap: 8 },
  half: { flex: 1 }
});
