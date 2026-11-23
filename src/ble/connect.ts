import { PermissionsAndroid, Platform, TurboModuleRegistry } from "react-native";
import type { Peripheral } from "react-native-ble-manager";

import type { Transport } from "@/jieli/client";
import { sampleTransport } from "@/jieli/sample";
import { loadPref, savePref } from "@/utils/prefs";

/** Expo Go has no Bluetooth module: there Shono talks to sample earbuds, so every screen can be tried without a build. */
const NO_BLUETOOTH = !TurboModuleRegistry.get("BleManager");
export const usingSample = () => NO_BLUETOOTH;
const ble = async () => (await import("react-native-ble-manager")).default; // loaded only where it exists
type Ble = Awaited<ReturnType<typeof ble>>;

// The JieLi RCSP channel, as 128-bit UUIDs (Android reports them in this form)
const SERVICE = "0000ae00-0000-1000-8000-00805f9b34fb";
const WRITE = "0000ae01-0000-1000-8000-00805f9b34fb";
const NOTIFY = "0000ae02-0000-1000-8000-00805f9b34fb";
const SCAN_S = 8;
const CONNECT_TIMEOUT_MS = 8000;
const MTU = 247; // what the earbuds agreed to on Windows

let started: Promise<void> | undefined;
const LAST_KEY = "budpilot.lastEarbuds";
// the earbuds found last, remembered across restarts: reconnecting goes straight to them, since Android doesn't let an
// app in the background scan without filters while the screen is off
let known: string | undefined;
const lastEarbuds = () => (known ??= loadPref<string>(LAST_KEY));

export const hasKnownEarbuds = () => !!lastEarbuds();

const isEarbuds = (p: Peripheral) =>
  (p.name ?? p.advertising?.localName ?? "").toUpperCase().startsWith("HOCO") ||
  !!p.advertising?.serviceUUIDs?.some((u) => u.toLowerCase() === SERVICE || u.toLowerCase() === "ae00");

/** Android 11 and older only let apps scan for Bluetooth devices with location access (and Location switched on). */
export const needsLocation = () => Platform.OS === "android" && Number(Platform.Version) < 31;

/** Asks for what scanning needs: Nearby devices on Android 12+, location on 11 and older. "blocked": the person chose
 * "Don't ask again", so only Android's settings can allow it now. Expo Go's sample earbuds need nothing. */
export async function requestBluetoothAccess(): Promise<"granted" | "denied" | "blocked"> {
  if (NO_BLUETOOTH || Platform.OS !== "android") return "granted";
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted = needsLocation() ? [P.ACCESS_FINE_LOCATION] : [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT];
  const got = await PermissionsAndroid.requestMultiple(wanted);
  if (wanted.every((p) => got[p] === PermissionsAndroid.RESULTS.GRANTED)) return "granted";
  return wanted.some((p) => got[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) ? "blocked" : "denied";
}

/** Scans until the earbuds show up (or SCAN_S passes). */
async function find(BleManager: Ble): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      found.remove();
      stopped.remove();
      void BleManager.stopScan().catch(() => {});
      fn();
    };
    const found = BleManager.onDiscoverPeripheral((p) => {
      if (isEarbuds(p)) finish(() => resolve(p.id));
    });
    const stopped = BleManager.onStopScan(() =>
      finish(() => reject(new Error("Couldn't find your earbuds. Take them out of the case and close other apps that control them."))),
    );
    BleManager.scan({ seconds: SCAN_S }).catch((e) => finish(() => reject(e)));
  });
}

/** Finds the earbuds over Bluetooth LE and opens the JieLi channel.
 * `reuse` reconnects to the earbuds found before, e.g. after they went back in the case. */
export async function connectEarbuds({ reuse = false } = {}): Promise<Transport> {
  if (NO_BLUETOOTH) {
    known = "sample";
    await new Promise((r) => setTimeout(r, 700)); // like finding real ones
    return sampleTransport();
  }
  const BleManager = await ble();
  started ??= BleManager.start({ showAlert: false });
  await started;
  if ((await requestBluetoothAccess()) !== "granted")
    throw new Error(needsLocation() ? "Shono needs location access to look for your earbuds." : "Shono needs Nearby devices access to reach your earbuds.");
  if ((await BleManager.checkState()) !== "on") throw new Error("Bluetooth is off. Turn it on to reach your earbuds.");
  // give up on an attempt after a while, like on Windows: a pending connect can sit on earbuds that went away
  const link = async (to: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      BleManager.connect(to),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void BleManager.disconnect(to).catch(() => {});
          reject(new Error("The earbuds didn't answer."));
        }, CONNECT_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
  };
  const last = lastEarbuds();
  let id: string;
  if (reuse) {
    if (!last) throw new Error("No earbuds found yet.");
    await link((id = last));
  } else {
    // the earbuds from last time first (no scan needed), then a scan for any earbuds
    const direct = last ? await link(last).then(() => true, () => false) : false;
    id = direct ? last! : await find(BleManager);
    if (!direct) await link(id);
    known = id;
    savePref(LAST_KEY, id);
  }
  const mtu = await BleManager.requestMTU(id, MTU).catch(() => 23);
  await BleManager.retrieveServices(id, [SERVICE]);

  let onData: (b: Uint8Array) => void = () => {};
  let onDrop: () => void = () => {};
  const subs = [
    BleManager.onDidUpdateValueForCharacteristic((e) => {
      const c = e.characteristic.toLowerCase();
      if (e.peripheral === id && (c === NOTIFY || c === "ae02")) onData(Uint8Array.from(e.value));
    }),
    BleManager.onDisconnectPeripheral((e) => {
      if (e.peripheral !== id) return;
      subs.forEach((s) => s.remove()); // each link's listeners fire only for its own drop
      onDrop();
    }),
  ];
  try {
    await BleManager.startNotification(id, SERVICE, NOTIFY);
  } catch (e) {
    subs.forEach((s) => s.remove());
    await BleManager.disconnect(id).catch(() => {});
    throw e;
  }
  // one write at a time, each frame in one packet (the library splits at 20 bytes unless told the MTU)
  let writing: Promise<unknown> = Promise.resolve();
  return {
    name: "Earbuds",
    write: (b) => {
      const done = writing.then(() => BleManager.writeWithoutResponse(id, SERVICE, WRITE, Array.from(b), mtu - 3, 0));
      writing = done.catch(() => {});
      return done;
    },
    onData: (cb) => (onData = cb),
    onDisconnect: (cb) => (onDrop = cb),
    close: async () => {
      subs.forEach((s) => s.remove());
      await BleManager.disconnect(id).catch(() => {});
    },
  };
}
