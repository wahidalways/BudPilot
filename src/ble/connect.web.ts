import type { Transport } from "@/jieli/client";

const SERVICE = 0xae00;
const WRITE = 0xae01;
const NOTIFY = 0xae02;

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

/** Asks the browser (or the Electron shell) for the earbuds and opens the JieLi channel. */
export async function connectEarbuds(): Promise<Transport> {
  const bluetooth = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
  if (!bluetooth) throw new Error("Bluetooth isn't available here. Use the BudPilot app, Edge or Chrome.");
  let device: Device;
  try {
    device = await bluetooth.requestDevice({ filters: [{ namePrefix: "HOCO" }, { services: [SERVICE] }], optionalServices: [SERVICE] });
  } catch {
    throw new Error("Couldn't find your earbuds. Take them out of the case and disconnect other apps that control them.");
  }
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(SERVICE);
  const [w, n] = await Promise.all([service.getCharacteristic(WRITE), service.getCharacteristic(NOTIFY)]);
  let onData: (b: Uint8Array) => void = () => {};
  n.addEventListener("characteristicvaluechanged", () => {
    const v = n.value!;
    onData(new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)));
  });
  await n.startNotifications();
  return {
    name: device.name ?? "Earbuds",
    write: (b) => w.writeValueWithoutResponse(b as Uint8Array<ArrayBuffer>),
    onData: (cb) => (onData = cb),
    onDisconnect: (cb) => device.addEventListener("gattserverdisconnected", cb),
    close: async () => device.gatt!.disconnect(),
  };
}
