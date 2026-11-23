import "expo-sqlite/localStorage/install"; // saved settings: the same budpilot.* keys as on Windows (utils/prefs)

// one module per weight: the packages' index files pull in all 36 font files when 5 are used
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Sora_600SemiBold } from "@expo-google-fonts/sora/600SemiBold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MobileApp } from "@/mobile/shell";
import { ThemeProvider } from "@/theme";

/** Shono for Android phones and tablets. */
export default function App() {
  const [loaded, failed] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Sora_600SemiBold, Sora_700Bold });
  if (!loaded && !failed) return null; // bundled, so this is a moment; without it text would flash in a fallback font
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MobileApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
