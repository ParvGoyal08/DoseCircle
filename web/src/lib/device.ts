import type { LanguageCode } from "@dosecircle/shared";
import { api, setTokenProvider } from "./api";

/**
 * The parent's phone holds one long-lived device token, issued in exchange for the one-time code.
 * localStorage persists in an installed web app; on iOS the app must be installed before pairing,
 * because Home Screen apps do not share storage with Safari.
 */
const TOKEN_KEY = "dosecircle.device";

interface StoredDevice {
  token: string;
  displayName: string;
  lang: LanguageCode;
}

export function pairedDevice(): StoredDevice | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredDevice) : null;
  } catch {
    return null;
  }
}

function store(device: StoredDevice | null) {
  try {
    if (device) localStorage.setItem(TOKEN_KEY, JSON.stringify(device));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage refused (private mode): pairing lasts for this session only.
  }
}

let memoryDevice: StoredDevice | null = null;
setTokenProvider("device", async () => (pairedDevice() ?? memoryDevice)?.token ?? null);

export async function pairPhone(code: string): Promise<StoredDevice> {
  const result = await api<{ deviceToken: string; parent: { displayName: string; lang: LanguageCode } }>("/parent/pair", {
    method: "POST",
    auth: "none",
    body: { code },
  });
  const device = { token: result.deviceToken, displayName: result.parent.displayName, lang: result.parent.lang };
  memoryDevice = device;
  store(device);
  return device;
}

export function updateStoredLanguage(lang: LanguageCode) {
  const device = pairedDevice();
  if (device) store({ ...device, lang });
}

export function forgetDevice() {
  memoryDevice = null;
  store(null);
}
