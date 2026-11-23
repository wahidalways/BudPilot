// Shono's background keeper (Android): a foreground service with an ongoing notification, and Android timers for
// Shono's background work (utils/later.ts). Missing in Expo Go and on other platforms: then every call does nothing.
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type Subscription = { remove(): void };
export type SoundDevice = { address: string; name: string };
/** Where the phone was when the earbuds last disconnected (`at`: ms since 1970); `place`: a street name, when found. */
export type DeviceClass = { lowRam: boolean; ramGb: number; sdk: number };
export type LastSeenPlace = { lat: number; lng: number; accuracy: number; at: number; place?: string };
type KeeperModule = {
  start(title: string, text: string): boolean;
  stop(): void;
  soundDevices(): Promise<SoundDevice[]>;
  log(line: string): Promise<void>;
  later(id: number, ms: number): void;
  cancelLater(id: number): void;
  backgroundUnrestricted(): boolean;
  askBackgroundUnrestricted(): boolean;
  deviceClass(): DeviceClass | null;
  hasUsageAccess(): boolean;
  openUsageAccess(): boolean;
  watchGames(on: boolean): void;
  readLog(): Promise<string>;
  clearLog(): void;
  setLastSeen(enabled: boolean, address: string | null): void;
  getLastSeen(): Promise<LastSeenPlace | null>;
  clearLastSeen(): void;
  addListener(event: "onStopPressed" | "onSoundDevicesChanged" | "onLastSeen", listener: () => void): Subscription;
  addListener(event: "onLater", listener: (e: { id: number }) => void): Subscription;
  addListener(event: "onGameChanged", listener: (e: { playing: boolean }) => void): Subscription;
};

const native = Platform.OS === "android" ? requireOptionalNativeModule<KeeperModule>("ShonoKeeper") : null;


export const keeperAvailable = () => !!native;

/** Starts the service, or updates its notification. False when Android refused (an app in the background can't start
 * one on Android 12+). */
export const startKeeper = (title: string, text: string) => native?.start(title, text) ?? false;
export const stopKeeper = () => native?.stop();
/** The devices connected to the phone for sound (music or calls), or undefined where that can't be known. A query
 * that doesn't answer within 2 s counts as unknown. */
export const soundDevices = async (): Promise<SoundDevice[] | undefined> =>
  native
    ? Promise.race([native.soundDevices(), new Promise<undefined>((r) => void nativeLater!(() => r(undefined), 2000))]).catch(() => undefined)
    : undefined;
/** Sound connections coming and going (and Bluetooth switching on or off): look again with soundDevices(). */
export const onSoundDevicesChanged = (listener: () => void): Subscription => native?.addListener("onSoundDevicesChanged", listener) ?? { remove() {} };

/** Shono's log on the phone (see ShonoLog.kt): a line with the time in front. Nothing elsewhere. */
export const logLine = (line: string) => void native?.log(line).catch(() => {});

/** A timer on Android's own clock (see utils/later.ts), which keeps running in the background. */
export const nativeLater = native
  ? (() => {
      let next = 1;
      const pending = new Map<number, () => void>();
      native.addListener("onLater", ({ id }) => {
        const run = pending.get(id);
        pending.delete(id);
        run?.();
      });
      return (fn: () => void, ms: number) => {
        const id = next++;
        pending.set(id, fn);
        native.later(id, ms);
        return () => {
          if (pending.delete(id)) native.cancelLater(id);
        };
      };
    })()
  : undefined;

/** "Run without limits": whether Android lets Shono run in the background without battery limits, and its question. */
export const backgroundUnrestricted = () => native?.backgroundUnrestricted() ?? true;
export const askBackgroundUnrestricted = () => native?.askBackgroundUnrestricted() ?? false;
/** Game mode › Turn on with games: Usage access (to see which app is in front), Android's page to allow it, and the
 * watch itself (a game opening or closing). */
export const hasUsageAccess = () => native?.hasUsageAccess() ?? false;
export const openUsageAccess = () => native?.openUsageAccess() ?? false;
export const watchGames = (on: boolean) => native?.watchGames(on);
export const onGameChanged = (listener: (e: { playing: boolean }) => void): Subscription =>
  native?.addListener("onGameChanged", listener) ?? { remove() {} };

/** Low RAM, total RAM and Android version; null where unknown (Expo Go, Windows). */
export const deviceClass = () => native?.deviceClass() ?? null;
export const readLog = async () => (native ? native.readLog() : "");
export const clearLog = () => native?.clearLog();

/** Find my earbuds › Last seen: on or off, and which earbuds to watch (their Bluetooth address). */
export const setLastSeen = (enabled: boolean, address?: string) => native?.setLastSeen(enabled, address ?? null);
export const getLastSeen = async (): Promise<LastSeenPlace | null> => (native ? native.getLastSeen() : null);
export const clearLastSeen = () => native?.clearLastSeen();
/** A new place was saved (or its street name found). */
export const onLastSeen = (listener: () => void): Subscription => native?.addListener("onLastSeen", listener) ?? { remove() {} };

/** The notification's Stop button. */
export const onStopPressed = (listener: () => void): Subscription => native?.addListener("onStopPressed", listener) ?? { remove() {} };
