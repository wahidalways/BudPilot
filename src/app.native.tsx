import "expo-sqlite/localStorage/install"; // saved settings: the same budpilot.* keys as on Windows (utils/prefs)

// Inter and Sora are built into the app (app.json, expo-font's plugin), so nothing waits for them at launch; only the
// tab icons' font loads here. Sora Bold is the Windows tray's alone. (Expo Go has no built-in fonts: it shows the
// system font.)
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MobileApp } from "@/mobile/shell";
import { setNativeSplashHider } from "@/mobile/launch";
import { KeepTopClear } from "@/mobile/top-clear";
import { ThemeProvider } from "@/theme";
import { setNativeTimers } from "@/utils/later";

import { nativeLater } from "../modules/shono-keeper";

setNativeTimers(nativeLater); // Shono's background work runs on Android's timers (utils/later.ts)

// Android's splash (the mark on the plain ground) stays until Shono's loading screen has drawn the same mark in the same
// place (mobile/launch.tsx), so there's no blank frame between them; never longer than 4 s, whatever happens
void SplashScreen.preventAutoHideAsync().catch(() => {});
let splashGone = false;
const hideSplash = () => {
  if (splashGone) return;
  splashGone = true;
  void SplashScreen.hideAsync().catch(() => {});
};
setNativeSplashHider(hideSplash);
setTimeout(hideSplash, 4000);

/** Shono for Android phones and tablets. */
export default function App() {
  // the tab icons' font, so the bar never shows up empty for a moment
  const [loaded, failed] = useFonts(Ionicons.font);
  if (!loaded && !failed) return null; // bundled, so this is a moment
  return (
    <SafeAreaProvider>
      <ThemeProvider scoped>
        <KeepTopClear>
          <MobileApp />
        </KeepTopClear>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
