import type { Transport } from "@/jieli/client";

const SERVICE = 0xae00;
const WRITE = 0xae01;
const NOTIFY = 0xae02;
const CONNECT_TIMEOUT_MS = 8000;

// Just the slice of Web Bluetooth used here (not in TypeScript's DOM lib).
type Characteristic = EventTarget & {
  value?: DataView;
  startNotifications(): Promise<unknown>;
  writeValueWithoutResponse(b: BufferSource): Promise<void>;
};
type Device = EventTarget & {
  name?: string;
  gatt?: {
    connect(): Promise<{ getPrimaryService(uuid: number): Promise<{ getCharacteristic(uuid: number): Promise<Characteristic> }> }>;
    disconnect(): void;
  };
};
type Bluetooth = { requestDevice(options: object): Promise<Device> };

let known: Device | undefined; // the earbuds picked last, so reconnecting needs no device picker

export const hasKnownEarbuds = () => !!known;
export const knownEarbudsAddress = (): string | undefined => undefined; // the browser doesn't reveal it
/** The browser handles Bluetooth being off in its own device picker. */
export type BluetoothState = "on" | "off" | "unknown";
export const bluetoothState = async (): Promise<BluetoothState> => "on";
export const watchBluetooth = async (_cb: (s: BluetoothState) => void) => () => {};
export const turnOnBluetooth = async () => true;
export const hasBluetoothAccess = async () => true;

/** Windows tells Shono where the earbuds' sound is through its shell (use-desktop onPcLink), not from here. */
export const watchSoundHere = (_cb: (here: boolean | undefined) => void) => () => {};

/** The browser asks for Bluetooth in its own device picker, so there's nothing to ask for ahead of it. */
export const needsLocation = () => false;
export const requestBluetoothAccess = async (): Promise<"granted" | "denied" | "blocked"> => "granted";

/** The phone screens' browser preview (development only) sets this to try them on sample earbuds. */
export const usingSample = () => !!(globalThis as { __shonoSample?: boolean }).__shonoSample;

/** Asks the browser (or the Electron shell) for the earbuds and opens the JieLi channel.
 * `reuse` reconnects to the earbuds picked before, e.g. after they went back in the case. */
export async function connectEarbuds({ reuse = false } = {}): Promise<Transport> {
  if (usingSample()) return (await import("@/jieli/sample")).sampleTransport();
  const bluetooth = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
  if (!bluetooth) throw new Error("Bluetooth isn't available here. Use the Shono app, Edge or Chrome.");
  let device: Device;
  if (reuse) {
    if (!known) throw new Error("No earbuds picked yet.");
    device = known;
  } else {
    try {
      device = await bluetooth.requestDevice({ filters: [{ namePrefix: "HOCO" }, { services: [SERVICE] }], optionalServices: [SERVICE] });
    } catch {
      throw new Error("Couldn't find your earbuds. Take them out of the case and disconnect other apps that control them.");
    }
    known = device;
  }
  // Give up on an attempt after a while: Windows can sit on a connect to switched-off earbuds and then miss them coming back.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const server = await Promise.race([
    device.gatt!.connect(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        device.gatt!.disconnect(); // cancels the pending attempt
        reject(new Error("The earbuds didn't answer."));
      }, CONNECT_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  const service = await server.getPrimaryService(SERVICE);
  const [w, n] = await Promise.all([service.getCharacteristic(WRITE), service.getCharacteristic(NOTIFY)]);
  let onData: (b: Uint8Array) => void = () => {};
  n.addEventListener("characteristicvaluechanged", () => {
    const v = n.value!;
    onData(new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)));
  });
  await n.startNotifications();
  // One GATT write at a time: overlapping writes fail with "GATT operation already in progress".
  let writing: Promise<unknown> = Promise.resolve();
  return {
    name: device.name ?? "Earbuds",
    write: (b) => {
      const done = writing.then(() => w.writeValueWithoutResponse(b as Uint8Array<ArrayBuffer>));
      writing = done.catch(() => {});
      return done;
    },
    onData: (cb) => (onData = cb),
    // once: a reconnect reuses the device object, so each link's listener must fire only for its own drop
    onDisconnect: (cb) => device.addEventListener("gattserverdisconnected", cb, { once: true }),
    close: async () => device.gatt!.disconnect(),
  };
}
