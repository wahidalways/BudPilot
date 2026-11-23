// Shono's background keeper (Android): a foreground service with an ongoing notification, and a headless JS task so
// React Native keeps Shono's timers running in the background. Missing in Expo Go and on other platforms: then every
// call does nothing.
import { requireOptionalNativeModule } from "expo";
import { AppRegistry, Platform } from "react-native";

type Subscription = { remove(): void };
type KeeperModule = {
  start(title: string, text: string): boolean;
  stop(): void;
  addListener(event: "onStopPressed", listener: () => void): Subscription;
};

const native = Platform.OS === "android" ? requireOptionalNativeModule<KeeperModule>("ShonoKeeper") : null;

// The task does nothing itself; while it runs, React Native doesn't pause timers in the background. The native side
// starts and finishes it with the service.
if (native) AppRegistry.registerHeadlessTask("ShonoKeeper", () => () => new Promise<void>(() => {}));

export const keeperAvailable = () => !!native;

/** Starts the service, or updates its notification. False when Android refused (an app in the background can't start
 * one on Android 12+). */
export const startKeeper = (title: string, text: string) => native?.start(title, text) ?? false;
export const stopKeeper = () => native?.stop();
/** The notification's Stop button. */
export const onStopPressed = (listener: () => void): Subscription => native?.addListener("onStopPressed", listener) ?? { remove() {} };
