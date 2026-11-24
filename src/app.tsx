// one module per weight: the packages' index files pull in all 36 font files (6 MB) when 5 are used
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Sora_600SemiBold } from "@expo-google-fonts/sora/600SemiBold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { useFonts } from "expo-font";
import { lazy, Suspense } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { desktop } from "@/hooks/use-desktop";
import { Home } from "@/screens/home";
import { ThemeProvider, type ThemeChoice } from "@/theme";
import { Frost } from "@/ui/frost";

const WEB = Platform.OS === "web" && typeof document !== "undefined";

// Web: a title bar you can drag, thin scrollbars instead of Windows' grey ones, and no motion when Windows' "Animation
// effects" are off (every transition and animation in Shono is CSS, so this one rule covers them all).
if (WEB) {
  const style = document.createElement("style");
  style.textContent =
    '[data-drag="1"] { -webkit-app-region: drag; user-select: none; }' +
    ' [data-drag="1"] [role="button"] { -webkit-app-region: no-drag; }' +
    " ::-webkit-scrollbar { width: 12px; height: 12px; background: transparent; }" +
    " ::-webkit-scrollbar-thumb { background: rgba(128, 128, 140, 0.38); border-radius: 999px; border: 4px solid transparent; background-clip: content-box; }" +
    " ::-webkit-scrollbar-thumb:hover { background-color: rgba(128, 128, 140, 0.6); }" +
    " ::-webkit-scrollbar-corner { background: transparent; }" +
    " @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }";
  document.head.appendChild(style);
}

const tellShell = (t: ThemeChoice) => desktop()?.setTheme(t);

// Development only: ?phone shows the Android screens in the browser, on sample earbuds (production builds fold this away)
const PhonePreview = __DEV__ && WEB && new URLSearchParams(location.search).has("phone") ? lazy(() => import("@/mobile/preview")) : null;

export default function App() {
  const [loaded, failed] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Sora_600SemiBold, Sora_700Bold });
  if (!loaded && !failed) return null; // bundled, so this is a moment; without it text would flash in a fallback font
  if (PhonePreview)
    return (
      <ThemeProvider scoped>
        <Suspense fallback={null}>
          <PhonePreview />
        </Suspense>
      </ThemeProvider>
    );
  return (
    <ThemeProvider onTheme={tellShell}>
      <Frost />
      {/* the window's size, so the views wrap to it: the page root lays children out in a row that never shrinks them,
          and without this the tray grew to its widest line and was cut off (expo-router used to add it) */}
      <View style={s.root}>
        <Home />
      </View>
    </ThemeProvider>
  );
}

const s = StyleSheet.create({ root: { flex: 1 } });
