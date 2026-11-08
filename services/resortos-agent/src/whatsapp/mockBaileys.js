export default function makeWASocket() {
  return {
    ev: { on: () => {}, off: () => {} },
    ws: { close: () => {} }
  };
}

export const useMultiFileAuthState = async () => ({
  state: { creds: {}, keys: {} },
  saveCreds: () => {}
});

export const fetchLatestBaileysVersion = async () => ({
  version: [2, 3000, 1015901307],
  isLatest: true
});

export const makeCacheableSignalKeyStore = (state) => state;
