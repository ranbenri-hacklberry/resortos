import { requireOptionalNativeModule } from 'expo';

export type TapAvailability = {
  ok?: boolean;
  platform?: string;
  supported?: boolean;
  mock?: boolean;
  nfc?: boolean;
  nfcEnabled?: boolean;
  code?: string;
};

type CardcomNative = {
  availability: () => TapAvailability;
  registerDevice: (tpn: string, merchantCode: string) => Promise<Record<string, unknown>>;
  performTransaction: (inputJson: string, sessionKey: string) => Promise<Record<string, unknown>>;
};

const native = requireOptionalNativeModule<CardcomNative>('CardcomTap');

export function getCardcomTap(): CardcomNative | null {
  return native;
}
