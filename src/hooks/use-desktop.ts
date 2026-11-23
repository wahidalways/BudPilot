import { useEffect, useState } from "react";

import type { ThemeChoice } from "@/theme";

export type View = "flyout" | "settings";
type WindowAction = "minimize" | "maximize" | "close" | "settings" | "flyout";

/** Where the window sits on its screen (CSS pixels); `stamp` changes when the desktop wallpaper does. */
export type Place = { x: number; y: number; screenW: number; screenH: number; stamp: string };

/** What the Windows app's preload exposes; absent in a plain browser or on Android. */
type Desktop = {
  /** `view`: what the window shows when the page loads. */
  info: { view: View };
  getStartWithWindows(): Promise<boolean | null>;
  setStartWithWindows(on: boolean): Promise<boolean | null>;
  onView(cb: (v: View) => void): () => void;
  window(action: WindowAction): void;
  setFlyoutHeight(h: number): void;
  setTheme(t: ThemeChoice): void;
  /** Presses Windows' volume up (n > 0) or down key |n| times. Missing in builds from before it existed. */
  volumeKeys?(n: number): void;
  /** Calls back whenever Windows' volume moves (percent), while the earbuds are connected (see mediaTaps). */
  onWindowsVolume?(cb: (percent: number) => void): () => void;
  /** For the frosted backdrop: the window's place and a small copy of the desktop wallpaper (a data URL, or null). */
  frost?(): Promise<Place & { wallpaper: string | null }>;
  onFrost?(cb: (p: Place) => void): () => void;
  /** Turns the play/pause tap fix on while the earbuds are connected. Missing in older builds. */
  mediaTaps?(on: boolean): void;
  /** Adds a line to the connection log. Missing in older builds. */
  log?(line: string): void;
  /** Calls back with whether Windows has the earbuds connected (for sound). Missing in older builds. */
  onPcLink?(cb: (on: boolean) => void): () => void;
};

export const desktop = () => (globalThis as { budpilotDesktop?: Desktop }).budpilotDesktop;

/** Which surface to draw: the tray flyout or the settings window. Without the Windows app it's always settings. */
export function useView(): View {
  const [view, setView] = useState<View>(() => desktop()?.info.view ?? "settings");
  useEffect(() => desktop()?.onView(setView), []);
  return view;
}
