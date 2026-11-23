import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { loadPref, savePref } from "@/utils/prefs";

export type Accent = "cobalt" | "spruce" | "graphite" | "amber" | "plum";
export type ThemeChoice = "system" | "light" | "dark";
export type Look = { theme: ThemeChoice; accent: Accent };

/** The accent palettes: one hue and saturation each; lightness is set per theme. */
export const ACCENTS: { key: Accent; name: string; h: number; s: number }[] = [
  { key: "cobalt", name: "Cobalt", h: 221, s: 68 },
  { key: "spruce", name: "Spruce", h: 172, s: 62 },
  { key: "graphite", name: "Graphite", h: 215, s: 16 },
  { key: "amber", name: "Amber", h: 33, s: 80 },
  { key: "plum", name: "Plum", h: 292, s: 30 },
];

/** Bundled with the app (see the root layout), so the look doesn't depend on a network. */
export const F = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  display: "Sora_600SemiBold",
  displayBold: "Sora_700Bold",
};

/** hsl → a color string both React Native and the web accept. */
export function hsl(h: number, s: number, l: number, a = 1): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `rgba(${f(0)}, ${f(8)}, ${f(4)}, ${a})`;
}

/** The palette for a theme and accent. The window itself is opaque (in a see-through one Chromium drops ClearType and
 * text looks soft); the frosted glass is painted inside it (ui/frost): `acrylic` and `mica` are its tints, `wall*`
 * its backdrop when there's no desktop wallpaper to show, `rim*` its lit edge. */
export function makeColors(dark: boolean, accent: Accent) {
  const { h, s } = ACCENTS.find((a) => a.key === accent) ?? ACCENTS[0];
  if (!dark) {
    const signal = hsl(h, s, 47);
    return {
      dark,
      ground: "#EEF0F4",
      surface: "#F7F8FA",
      window: "#F3F4F7", // the settings window (the Windows shell paints the same before the page loads)
      flyout: "#F7F8FA",
      raised: "#FFFFFF",
      ink: "#151820",
      ink2: "#586170",
      line: "#D6DBE2",
      signal,
      signalInk: hsl(h, s, 33),
      signalFill: signal,
      onSignal: "#FFFFFF",
      ok: "#2E8A57",
      warn: "#B44B1F",
      danger: "#B42318",
      card: "rgba(255, 255, 255, 0.55)",
      well: "rgba(20, 30, 50, 0.06)",
      hair: "rgba(20, 30, 50, 0.1)",
      stroke: "rgba(255, 255, 255, 0.7)",
      lens: "rgba(255, 255, 255, 0.92)",
      hover: "rgba(255, 255, 255, 0.8)", // glass under the pointer: a step towards the lens
      side: "rgba(255, 255, 255, 0.42)",
      tint: hsl(h, s, 52, 0.16),
      tintEdge: hsl(h, s, 45, 0.45),
      off: "rgba(120, 120, 128, 0.2)",
      onBg: signal,
      onInk: "#FFFFFF",
      onEdge: "transparent",
      shine: "inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 -0.5px 0 rgba(255, 255, 255, 0.4)",
      drop: "0 1px 2px rgba(16, 24, 40, 0.06), 0 6px 16px rgba(16, 24, 40, 0.08)",
      acrylic: "rgba(249, 250, 252, 0.78)", // the flyout: see-through
      mica: "rgba(247, 248, 250, 0.86)", // the settings window: calmer
      rimHi: "rgba(255, 255, 255, 0.95)",
      rimLo: "rgba(255, 255, 255, 0.3)",
      wallBase: hsl(h, s * 0.35, 95),
      wallA: hsl(h, s * 0.8, 68),
      wallB: hsl(h + 12, s * 0.8, 81),
    };
  }
  const ink = hsl(h, 16, 94);
  return {
    dark,
    // dark neutrals carry a trace of the accent
    ground: hsl(h, 12, 6),
    surface: hsl(h, 10, 11),
    window: hsl(h, 12, 9),
    flyout: hsl(h, 14, 10),
    raised: hsl(h, 9, 14.5),
    ink,
    ink2: hsl(h, 8, 67),
    line: hsl(h, 9, 20),
    signal: hsl(h, s, 64), // lines, knobs, accents on dark
    signalInk: hsl(h, s, 76), // accent text
    signalFill: hsl(h, s, 56), // switch on, the mark: deeper than the line color
    onSignal: hsl(h, 45, 10),
    ok: "#5CC48A",
    warn: "#F08A5D",
    danger: "#FF7A6E",
    card: "rgba(255, 255, 255, 0.045)",
    well: "rgba(0, 0, 0, 0.25)",
    hair: "rgba(255, 255, 255, 0.09)",
    stroke: "rgba(255, 255, 255, 0.12)",
    lens: "rgba(255, 255, 255, 0.16)",
    hover: "rgba(255, 255, 255, 0.09)",
    side: "rgba(255, 255, 255, 0.035)",
    tint: hsl(h, s, 60, 0.22),
    tintEdge: hsl(h, s, 65, 0.5),
    off: "rgba(120, 120, 128, 0.36)",
    // the selected pill: tinted glass with white text, not a loud solid fill
    onBg: hsl(h, s, 58, 0.28),
    onInk: ink,
    onEdge: hsl(h, s, 66, 0.55),
    shine: "inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -0.5px 0 rgba(255, 255, 255, 0.05)",
    drop: "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.25)",
    acrylic: hsl(h, 14, 10, 0.74),
    mica: hsl(h, 12, 9, 0.86),
    rimHi: "rgba(255, 255, 255, 0.24)",
    rimLo: "rgba(255, 255, 255, 0.05)",
    wallBase: hsl(h, s * 0.3, 7),
    wallA: hsl(h, s * 0.85, 34),
    wallB: hsl(h + 12, s, 24),
  };
}

export type Colors = ReturnType<typeof makeColors>;

const LOOK_KEY = "budpilot.look";
const DEFAULT_LOOK: Look = { theme: "system", accent: "cobalt" };

type Theme = { c: Colors; look: Look; setLook: (p: Partial<Look>) => void };
const ThemeContext = createContext<Theme | null>(null);

/** Theme and accent for the whole app; remembered on this computer. `onTheme` tells the Windows shell, so its window matches. */
export function ThemeProvider({ onTheme, children }: { onTheme?: (t: ThemeChoice) => void; children: ReactNode }) {
  const system = useColorScheme();
  const [look, setLookState] = useState<Look>(() => ({ ...DEFAULT_LOOK, ...loadPref<Partial<Look>>(LOOK_KEY) }));
  const dark = look.theme === "system" ? system === "dark" : look.theme === "dark";
  const c = useMemo(() => makeColors(dark, look.accent), [dark, look.accent]);
  const setLook = useCallback(
    (p: Partial<Look>) =>
      setLookState((old) => {
        const next = { ...old, ...p };
        savePref(LOOK_KEY, next);
        return next;
      }),
    [],
  );
  useEffect(() => onTheme?.(look.theme), [look.theme, onTheme]); // also on start, so the window matches a saved choice
  const value = useMemo(() => ({ c, look, setLook }), [c, look, setLook]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export const useTheme = (): Theme => {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme needs ThemeProvider");
  return t;
};
export const useColors = (): Colors => useTheme().c;
