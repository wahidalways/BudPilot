import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { loadPref, savePref } from "@/utils/prefs";

export type Accent = "cobalt" | "azure" | "indigo" | "violet" | "teal" | "emerald" | "sage" | "slate" | "gold" | "copper" | "red";
export type ThemeChoice = "system" | "light" | "dark";
/** The phone app's `glass` (frosted glass and motion) and `fullScreen` (Android's bars hidden): on unless turned off;
 * `battery`: the battery bars' style on the earbuds card. */
export type Look = { theme: ThemeChoice; accent: Accent; glass?: boolean; fullScreen?: boolean; battery?: "capsule" | "segments" };

/** The accent palettes (the user's set, 2026-11-24: Cobalt as before, cool colours, two soft warm ones and a red; no
 * pinks): one hue and saturation each; lightness is set per theme, with each colour's own where the usual would be
 * hard to read (contrast checked against WCAG's 4.5:1 for text). Light theme: `fill`, the lightness of a filled
 * control (buttons, switches, the selected pill), with dark text on it (`darkText`) where white wouldn't read; `line`,
 * the accent's lines (the EQ curve, knobs); `ink`, accent text. Dark theme: `darkFill`, a filled control under its
 * dark text. */
type AccentDef = { key: Accent; name: string; h: number; s: number; fill?: number; darkText?: boolean; line?: number; ink?: number; darkFill?: number };
export const ACCENTS: AccentDef[] = [
  { key: "cobalt", name: "Cobalt", h: 221, s: 68, darkFill: 60 },
  { key: "azure", name: "Azure", h: 203, s: 78, fill: 55, darkText: true, line: 42 },
  { key: "indigo", name: "Indigo", h: 238, s: 58, darkFill: 64 },
  { key: "violet", name: "Violet", h: 262, s: 52, darkFill: 62 },
  { key: "teal", name: "Teal", h: 176, s: 64, fill: 55, darkText: true, line: 38, ink: 28 },
  { key: "emerald", name: "Emerald", h: 150, s: 56, fill: 55, darkText: true, line: 38, ink: 28 },
  { key: "sage", name: "Sage", h: 140, s: 26, fill: 55, darkText: true, line: 42 },
  { key: "slate", name: "Slate", h: 212, s: 20 },
  { key: "gold", name: "Gold", h: 42, s: 72, fill: 55, darkText: true, line: 40, ink: 28 },
  { key: "copper", name: "Copper", h: 22, s: 58, fill: 42 },
  { key: "red", name: "Red", h: 2, s: 70, darkFill: 60 },
];
/** Colours that were offered before, and the nearest of today's. */
const RETIRED: Record<string, Accent> = { spruce: "teal", graphite: "slate", amber: "gold", plum: "violet" };

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
  const a = ACCENTS.find((x) => x.key === accent) ?? ACCENTS[0];
  const { h, s } = a;
  if (!dark) {
    const signal = hsl(h, s, a.line ?? 47);
    const fill = hsl(h, s, a.fill ?? 47);
    const onFill = a.darkText ? hsl(h, 45, 12) : "#FFFFFF";
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
      signalInk: hsl(h, s, a.ink ?? 33),
      signalFill: fill,
      onSignal: onFill,
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
      onBg: fill,
      onInk: onFill,
      onEdge: "transparent",
      shine: "inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 -0.5px 0 rgba(255, 255, 255, 0.4)",
      drop: "0 1px 2px rgba(16, 24, 40, 0.06), 0 6px 16px rgba(16, 24, 40, 0.08)",
      acrylic: "rgba(249, 250, 252, 0.78)", // the flyout: see-through
      mica: "rgba(247, 248, 250, 0.86)", // the settings window: calmer
      frost: "rgba(248, 249, 251, 0.58)", // the phone's bars, over a real blur
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
    signalFill: hsl(h, s, a.darkFill ?? 56), // switch on, the mark: deeper than the line color
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
    frost: hsl(h, 14, 9, 0.55),
    rimHi: "rgba(255, 255, 255, 0.24)",
    rimLo: "rgba(255, 255, 255, 0.05)",
    wallBase: hsl(h, s * 0.3, 7),
    wallA: hsl(h, s * 0.85, 34),
    wallB: hsl(h + 12, s, 24),
  };
}

export type Colors = ReturnType<typeof makeColors>;

const LOOK_KEY = "budpilot.look";
const DEFAULT_LOOK: Look = { theme: "system", accent: "cobalt", battery: "segments" };
/** What's saved, with a retired colour moved to its nearest current one. */
function savedLook(): Look {
  const saved = { ...DEFAULT_LOOK, ...loadPref<Partial<Look>>(LOOK_KEY) };
  const accent = RETIRED[saved.accent] ?? (ACCENTS.some((x) => x.key === saved.accent) ? saved.accent : DEFAULT_LOOK.accent);
  return { ...saved, accent };
}

type Theme = { c: Colors; look: Look; setLook: (p: Partial<Look>) => void };
const ThemeContext = createContext<Theme | null>(null);
// the colours on their own: most of the screen reads only them, so a look change that keeps the colours (full screen,
// glass, battery bars) doesn't re-render every line of text
const ColorsContext = createContext<Colors | null>(null);
// and the phone's glass choice on its own (every card reads it)
const GlassContext = createContext<boolean | undefined>(undefined);

/** Theme and accent for the whole app; remembered on this computer. `onTheme` tells the Windows shell, so its window matches.
 * `scoped` (the phone): the colours aren't handed to everything below; each part of the screen takes them with
 * KeepColors, so a page out of sight isn't re-rendered by a new theme (React re-runs every reader of a context below a
 * changed provider, even past a nested provider of it). */
export function ThemeProvider({ onTheme, scoped, children }: { onTheme?: (t: ThemeChoice) => void; scoped?: boolean; children: ReactNode }) {
  const system = useColorScheme();
  const [look, setLookState] = useState<Look>(savedLook);
  const dark = look.theme === "system" ? system === "dark" : look.theme === "dark";
  const c = useMemo(() => makeColors(dark, look.accent), [dark, look.accent]);
  // not a transition: one made the change land later, and restart whenever something else updated meanwhile (the
  // user: "responsive but changes are delayed"); the switches and segments answer the tap on their own already
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
  const glass = createElement(GlassContext.Provider, { value: look.glass }, children);
  return createElement(ThemeContext.Provider, { value }, scoped ? glass : createElement(ColorsContext.Provider, { value: c }, glass));
}

/** The colours for one part of a `scoped` screen. Out of sight (`live` false) it keeps the ones it last showed and
 * takes new ones when it's shown again: a new theme or accent re-renders only what's on screen (the phone's other
 * pages stay mounted, out of sight). */
export function KeepColors({ live = true, children }: { live?: boolean; children: ReactNode }) {
  const { c } = useTheme();
  const [kept, setKept] = useState(c);
  if (live && kept !== c) setKept(c); // its only setter, and the value reads the live colours anyway (see Sheet)
  return createElement(ColorsContext.Provider, { value: live ? c : kept }, children);
}

export const useTheme = (): Theme => {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme needs ThemeProvider");
  return t;
};
export const useColors = (): Colors => {
  const c = useContext(ColorsContext);
  if (!c) throw new Error("useColors needs ThemeProvider");
  return c;
};
/** The phone's "Glass and motion" choice; undefined until the person picks one. */
export const useGlassChoice = () => useContext(GlassContext);
