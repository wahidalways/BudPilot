// Shono's glass on phones and tablets, after Muse's: soft pools of the accent's colours behind everything (they slide a
// little when you change page), and neutral glass for the floating tab bar: a real blur under a clear fill, a bright
// top rim and a soft shadow. Android's "dark" blur tint is a grey wash, so dark glass uses a black one and lets the
// fill set the tone. "Glass and motion" in App settings turns it all off; Android's Remove animations keeps the
// glass and stops the motion.
import { BlurView } from "expo-blur";
import { type ComponentRef, createContext, type ReactNode, type RefObject, useEffect } from "react";
import { Platform, type StyleProp, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { type Colors, useColors, useGlassChoice } from "@/theme";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { deviceClass } from "../../modules/shono-keeper";

type ViewNode = ComponentRef<typeof View>;

// a low-end phone (low RAM, 4 GB or less, or Android 11 and older, where there's no real blur) starts with the
// lighter look; the switch in App settings still turns the glass on
const LOW_END = (() => {
  const d = deviceClass();
  return !!d && (d.lowRam || d.ramGb <= 4.2 || d.sdk < 31);
})();

export function useGlass() {
  const reduce = useReducedMotion();
  const glass = useGlassChoice() ?? !LOW_END; // only the glass choice: other look changes don't re-render every card
  return { glass, motion: glass && !reduce };
}

/** Behind everything on a phone or tablet: dark is a neutral near-black (the user's pick: no blue-tinted greys). */
export const groundOf = (c: Colors) => (c.dark ? "#08090B" : c.ground);
export const useGround = () => groundOf(useColors());

/** A card's fill, edge and shadow: Frost (milky glass; the user's pick), or the plain raised surface with glass off.
 * No blur per card: only the soft colour pools sit behind the cards, and through milky glass they're the same wash. */
export function useSurface() {
  const c = useColors();
  const { glass } = useGlass();
  if (!glass) return { bg: c.raised, edge: c.hair, shine: undefined };
  return c.dark
    ? { bg: "rgba(24, 26, 31, 0.7)", edge: "rgba(255, 255, 255, 0.09)", shine: "inset 0px 1px 0px rgba(255, 255, 255, 0.07), 0px 10px 26px rgba(0, 0, 0, 0.4)" }
    : { bg: "rgba(255, 255, 255, 0.66)", edge: "rgba(255, 255, 255, 0.9)", shine: "0px 6px 18px rgba(20, 30, 60, 0.07)" };
}

/** Whether the page holding this is the one on screen (pages that aren't stay mounted, just out of sight). */
export const PageActive = createContext(true);

// Android blurs from 12 on; older ones get the fill alone, more solid, so text under the bar doesn't show through
const BLURS = Platform.OS !== "android" || Number(Platform.Version) >= 31;

/** Muse's glass colours (src/components/Glass.tsx there): neutral, so the accent is the one coloured thing on it. */
export function useGlassColors() {
  const c = useColors();
  const { glass } = useGlass();
  if (!glass) {
    const solid = c.dark ? "rgb(22,22,24)" : "rgb(255,255,255)";
    return { blur: false, tint: "default" as const, fill: solid, edge: c.hair, rim: c.hair, shadow: undefined, capsule: c.tint, capsuleEdge: "transparent", capsuleShadow: undefined };
  }
  if (!c.dark) {
    return {
      blur: true,
      tint: "light" as const,
      fill: `rgba(255, 255, 255, ${BLURS ? 0.65 : 0.92})`,
      edge: "rgba(0, 0, 0, 0.08)",
      rim: "rgba(255, 255, 255, 0.95)",
      shadow: "0px 8px 24px rgba(0, 0, 0, 0.12), inset 0px 1px 0px rgba(255, 255, 255, 0.7)",
      // the chosen tab: a brighter, raised piece of the same glass, not a grey dip
      capsule: "rgba(255, 255, 255, 0.7)",
      capsuleEdge: "rgba(255, 255, 255, 0.95)",
      capsuleShadow: "0px 1px 4px rgba(0, 0, 0, 0.12)",
    };
  }
  return {
    blur: true,
    tint: "systemChromeMaterialDark" as const, // black, not Android's grey "dark"
    fill: `rgba(22, 22, 24, ${BLURS ? 0.6 : 0.92})`,
    edge: "rgba(255, 255, 255, 0.14)",
    rim: "rgba(255, 255, 255, 0.34)",
    shadow: "0px 10px 30px rgba(0, 0, 0, 0.5), inset 0px 1px 1px rgba(255, 255, 255, 0.12)",
    capsule: "rgba(255, 255, 255, 0.17)",
    capsuleEdge: "rgba(255, 255, 255, 0.28)",
    capsuleShadow: "0px 2px 8px rgba(0, 0, 0, 0.45)",
  };
}

/** A piece of glass that blurs `target` (the content under it). The outer layer carries the rim and shadow and
 * doesn't clip, so they spill past the edge; the inner one clips the blur and fill to the shape. `flat`: no rim or
 * shadow. `fill`: a denser tint than the default (used while glass is on; glass off keeps the solid colour). */
export function Glass({ target, radius, flat, fill, style, children }: { target: RefObject<ViewNode | null>; radius: number; flat?: boolean; fill?: string; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const g = useGlassColors();
  return (
    <View
      style={[
        { borderRadius: radius },
        !flat && { borderWidth: StyleSheet.hairlineWidth, borderColor: g.edge, borderTopColor: g.rim, boxShadow: g.shadow },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
        {g.blur && <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} tint={g.tint} style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: g.blur ? (fill ?? g.fill) : g.fill }]} />
      </View>
      {children}
    </View>
  );
}

/** The phone's top bar: the same milky Frost as the cards, over a real blur of the page, with a hairline under it.
 * Glass off: the plain bar colour. */
export function FrostBar({ target, style }: { target: RefObject<ViewNode | null>; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const g = useGlassColors();
  const fill = !g.blur ? g.fill : c.dark ? `rgba(24, 26, 31, ${BLURS ? 0.72 : 0.94})` : `rgba(255, 255, 255, ${BLURS ? 0.66 : 0.94})`;
  return (
    <View style={[style, { overflow: "hidden", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.dark ? "rgba(255, 255, 255, 0.07)" : "rgba(20, 30, 50, 0.08)" }]}>
      {g.blur && <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={70} tint={g.tint} style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
    </View>
  );
}

// a colour's alpha set to `a` (theme colours are rgba strings)
const alpha = (color: string, a: number) => color.replace(/,\s*[\d.]+\)\s*$/, `, ${a})`);
/** A soft round pool of colour, fading to nothing at its edge: a gradient the GPU draws (an SVG this size was a
 * screen-sized bitmap, 30-55 MB for the two). */
const pool = (color: string, o: number) =>
  `radial-gradient(circle closest-side, ${alpha(color, o)} 0%, ${alpha(color, o * 0.45)} 55%, ${alpha(color, 0)} 100%)`;

/** Behind everything: two pools of the accent's colours that drift a little toward the page you move to. Still
 * otherwise, so nothing redraws while you just read. */
export function Backdrop({ shift }: { shift: number }) {
  const c = useColors();
  const { glass, motion } = useGlass();
  const { width, height } = useWindowDimensions();
  // the top pool follows the top bar down by the status bar's height, so its light stays behind Shono's mark and title
  // (the user missed it after the top was kept clear in full screen)
  const top = useSafeAreaInsets().top;
  const x = useSharedValue(shift);
  useEffect(() => x.set(motion ? withSpring(shift, { dampingRatio: 1, duration: 1000 }) : shift), [shift, motion, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: -x.get() * 22 }, { translateY: x.get() * 12 }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * 16 }, { translateY: -x.get() * 18 }] }));
  if (!glass) return null;
  const big = Math.max(width, height) * (c.dark ? 0.8 : 1.05);
  const small = Math.max(width, height) * (c.dark ? 0.68 : 0.85);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[{ position: "absolute", left: -big * 0.42, top: -big * 0.46 + top, width: big, height: big, backgroundImage: pool(c.wallA, c.dark ? 0.45 : 0.5) }, a]}
      />
      <Animated.View
        style={[
          { position: "absolute", left: width - small * 0.5, top: height * 0.58 - small * 0.5, width: small, height: small, backgroundImage: pool(c.wallB, c.dark ? 0.32 : 0.75) },
          b,
        ]}
      />
    </View>
  );
}
