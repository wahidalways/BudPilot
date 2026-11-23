import type { Transport } from "@/jieli/client";

// shortcut: Android has no BLE transport yet; add react-native-ble-plx here when the Android build starts.
export async function connectEarbuds(_opts: { reuse?: boolean } = {}): Promise<Transport> {
  throw new Error("Android support is coming in a later version. Use Shono for Windows for now.");
}

export const hasKnownEarbuds = () => false;
