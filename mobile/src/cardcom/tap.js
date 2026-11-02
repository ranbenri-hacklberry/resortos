import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { tapSessionStore } from '../api';

const native = Platform.OS === 'android' ? requireOptionalNativeModule('CardcomTap') : null;

export function tapAvailability() {
  if (Platform.OS !== 'android' || !native?.availability) {
    return { supported: false, mock: false, platform: Platform.OS, nfc: false, nfcEnabled: false };
  }
  try {
    return native.availability();
  } catch {
    return { supported: false, mock: true, platform: 'android', nfc: false, nfcEnabled: false };
  }
}

export function deviceProfile(uuid) {
  const constants = Platform.constants || {};
  return {
    uuid,
    manufacturer: String(constants.Manufacturer || (Platform.OS === 'ios' ? 'Apple' : 'Android')).slice(0, 80),
    model: String(constants.Model || constants.Brand || 'mobile').slice(0, 80)
  };
}

export function createTapClient() {
  return {
    async getSession() {
      const raw = await tapSessionStore.get();
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async setSession(session) {
      if (!session) await tapSessionStore.del();
      else await tapSessionStore.set(JSON.stringify({
        sessionKey: session.sessionKey,
        sapakMutavNumber: session.sapakMutavNumber,
        ravMutavTerminalNumber: session.ravMutavTerminalNumber
      }));
    },
    async registerDevice({ tpn, merchantCode }) {
      if (!native) return { ok: false, code: 'TAP_ANDROID_ONLY' };
      return native.registerDevice(String(tpn || ''), String(merchantCode || ''));
    },
    async performTransaction({ sdkRequest, sessionKey }) {
      if (!native) return { ok: false, code: 'TAP_ANDROID_ONLY', message: 'נגיעה זמינה רק באנדרואיד' };
      const result = await native.performTransaction(JSON.stringify(sdkRequest), String(sessionKey || ''));
      const raw = result?.raw || result;
      return {
        ...result,
        raw,
        response_code: result?.response_code || raw?.response_code || ''
      };
    }
  };
}
