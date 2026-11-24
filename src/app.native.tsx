import "expo-sqlite/localStorage/install"; // saved settings: the same budpilot.* keys as on Windows (utils/prefs)

// one module per weight: the packages' index files pull in all 36 font files when 5 are used
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Sora_600SemiBold } from "@expo-google-fonts/sora/600SemiBold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
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
  // the tab icons' font too, so the bar never shows up empty for a moment
  const [loaded, failed] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Sora_600SemiBold, Sora_700Bold, ...Ionicons.font });
  if (!loaded && !failed) return null; // bundled, so this is a moment; without it text would flash in a fallback font
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
