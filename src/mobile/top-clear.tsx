import type { ReactNode } from "react";
import { StatusBar } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

/** Every screen keeps at least a status bar's height clear at the top. Full screen hides Android's status bar and
 * Android then reports no top inset, so titles ran up into the camera hole; a browser (the ?phone preview) has no
 * status bar either, so it gets a phone's 24 and is spaced the way the phone is. */
export function KeepTopClear({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, StatusBar.currentHeight ?? 24);
  return <SafeAreaInsetsContext.Provider value={{ ...insets, top }}>{children}</SafeAreaInsetsContext.Provider>;
}
