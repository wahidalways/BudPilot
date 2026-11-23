import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from "@expo-google-fonts/inter";
import { Sora_600SemiBold, Sora_700Bold } from "@expo-google-fonts/sora";
import { Slot } from "expo-router";
import { Platform } from "react-native";

import { desktop } from "@/hooks/use-desktop";
import { ThemeProvider, type ThemeChoice } from "@/theme";
import { Frost } from "@/ui/frost";

const WEB = Platform.OS === "web" && typeof document !== "undefined";

// Web: a title bar you can drag, and thin scrollbars instead of Windows' grey ones.
if (WEB) {
  const style = document.createElement("style");
  style.textContent =
    '[data-drag="1"] { -webkit-app-region: drag; user-select: none; }' +
    ' [data-drag="1"] [role="button"] { -webkit-app-region: no-drag; }' +
    " ::-webkit-scrollbar { width: 12px; height: 12px; background: transparent; }" +
    " ::-webkit-scrollbar-thumb { background: rgba(128, 128, 140, 0.38); border-radius: 999px; border: 4px solid transparent; background-clip: content-box; }" +
    " ::-webkit-scrollbar-thumb:hover { background-color: rgba(128, 128, 140, 0.6); }" +
    " ::-webkit-scrollbar-corner { background: transparent; }";
  document.head.appendChild(style);
}

const tellShell = (t: ThemeChoice) => desktop()?.setTheme(t);

export default function RootLayout() {
  const [loaded, failed] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Sora_600SemiBold, Sora_700Bold });
  if (!loaded && !failed) return null; // bundled, so this is a moment; without it text would flash in a fallback font
  return (
    <ThemeProvider onTheme={tellShell}>
      <Frost />
      <Slot />
    </ThemeProvider>
  );
}
