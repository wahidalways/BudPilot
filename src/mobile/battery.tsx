// The battery bars on the earbuds card, in the style picked in App settings: Capsule (a slim rounded bar) or Segments
// (ten small steps). No end cap. They fill when the earbuds connect and the number counts up with them, light flows
// through a charging one, and a low one breathes. Movement is transform and opacity only, and it rests while motion is
// off, the page is out of sight, or Shono is in the background.
import { use, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { F, useColors } from "@/theme";

import { PageActive, useGlass } from "./glass";

export type BatteryStyle = "capsule" | "segments";
export const BATTERY_STYLES: { value: BatteryStyle; label: string }[] = [
  { value: "capsule", label: "Capsule" },
  { value: "segments", label: "Segments" },
];

const W = 52; // a bar's width
const BAND = 22; // the charging light's width
const RISE_MS = 780;
const STEP_MS = 70; // left, case and right fill one after another
const EASE = Easing.out(Easing.cubic);

/** Whether Shono is the app in front (looping animations rest while it isn't). */
export function useAppActive() {
  const [on, setOn] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setOn(s === "active"));
    return () => sub.remove();
  }, []);
  return on;
}

/** A value that loops while `on` (0 → 1, `ms` each way; `back`: and back down), and rests at `rest` otherwise. */
function useLoop(on: boolean, ms: number, back: boolean, rest: number) {
  const v = useSharedValue(rest);
  useEffect(() => {
    if (!on) {
      cancelAnimation(v);
      v.set(withTiming(rest, { duration: 200 }));
      return;
    }
    v.set(0);
    v.set(withRepeat(withTiming(1, { duration: ms, easing: back ? Easing.inOut(Easing.sin) : Easing.linear }), -1, back));
  }, [on, ms, back, rest, v]);
  return v;
}

export type BatteryTone = "accent" | "ok" | "warn" | "danger";
export const batteryTone = (percent: number, charging: boolean): BatteryTone =>
  charging ? "ok" : percent <= 10 ? "danger" : percent <= 20 ? "warn" : "accent";

/**
 * One earbud's (or the case's) level: the number and its bar. `live`: the earbuds are connected and this level is
 * known; it rises from empty when that turns on. `order` staggers the three.
 */
export function BatteryLevel({ kind, live, percent, charging, order }: { kind: BatteryStyle; live: boolean; percent: number; charging: boolean; order: number }) {
  const c = useColors();
  const { motion } = useGlass();
  const page = use(PageActive);
  const app = useAppActive();
  const alive = motion && page && app;
  const tone = batteryTone(percent, charging);
  const fill = { accent: c.signal, ok: c.ok, warn: c.warn, danger: c.danger }[tone];
  const ink = { accent: c.ink, ok: c.ok, warn: c.warn, danger: c.danger }[tone];

  // the level as 0..1: from empty, it rises in turn and the number counts up with it; after that it eases to changes
  const v = useSharedValue(0);
  useEffect(() => {
    const to = live ? percent / 100 : 0;
    if (!motion) return void v.set(to);
    const fromEmpty = v.get() === 0;
    v.set(withDelay(fromEmpty ? order * STEP_MS : 0, withTiming(to, { duration: fromEmpty ? RISE_MS : 380, easing: EASE })));
  }, [live, percent, motion, order, v]);
  const [shown, setShown] = useState(0);
  useAnimatedReaction(
    () => Math.round(v.get() * 100),
    (n, before) => {
      if (n !== before) scheduleOnRN(setShown, n);
    },
  );

  const flow = useLoop(alive && live && charging, 2400, false, 0);
  const breathe = useLoop(alive && live && !charging && percent <= 20, 1300, true, 0);
  const blink = useLoop(alive && live && charging, 700, true, 0);

  return (
    <>
      <Text style={[s.pct, { color: live ? ink : c.ink2 }]}>
        {live ? shown : "—"}
        {live && <Text style={[s.pctSign, { color: c.ink2 }]}>%</Text>}
      </Text>
      {kind === "segments" ? (
        <Segments v={v} percent={live ? percent : 0} fill={fill} well={c.well} charging={live && charging} breathe={breathe} blink={blink} />
      ) : (
        <Capsule v={v} fill={fill} well={c.well} charging={live && charging} flow={flow} breathe={breathe} />
      )}
    </>
  );
}

/** A slim rounded track; the fill slides in from the left (so its rounded end stays round) and carries the light. */
function Capsule({ v, fill, well, charging, flow, breathe }: { v: SharedValue<number>; fill: string; well: string; charging: boolean; flow: SharedValue<number>; breathe: SharedValue<number> }) {
  const slide = useAnimatedStyle(() => ({ opacity: 1 - breathe.get() * 0.55, transform: [{ translateX: (v.get() - 1) * W }] }));
  // the light crosses the visible part of the fill, then rests a moment before the next pass
  const light = useAnimatedStyle(() => {
    const p = interpolate(flow.get(), [0, 0.7, 1], [0, 1, 1]);
    return { transform: [{ translateX: (1 - v.get()) * W - BAND + p * (v.get() * W + BAND) }] };
  });
  return (
    <View style={[s.capsule, { backgroundColor: well }]}>
      <Animated.View style={[s.capsuleFill, { backgroundColor: fill }, slide]}>
        {charging && (
          <Animated.View style={[s.light, light]}>
            <Svg width={BAND} height={6}>
              <Defs>
                <LinearGradient id="batteryLight" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.75} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width={BAND} height={6} fill="url(#batteryLight)" />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

/** Ten steps that light up one after another as the level rises; while charging, the next one glows on and off. */
function Segments({
  v,
  percent,
  fill,
  well,
  charging,
  breathe,
  blink,
}: {
  v: SharedValue<number>;
  percent: number;
  fill: string;
  well: string;
  charging: boolean;
  breathe: SharedValue<number>;
  blink: SharedValue<number>;
}) {
  const lit = percent > 0 ? Math.max(1, Math.round(percent / 10)) : 0;
  return (
    <View style={s.segments}>
      {Array.from({ length: 10 }, (_, i) => (
        <Step key={i} i={i} v={v} fill={fill} well={well} next={charging && i === lit} breathe={breathe} blink={blink} />
      ))}
    </View>
  );
}

function Step({ i, v, fill, well, next, breathe, blink }: { i: number; v: SharedValue<number>; fill: string; well: string; next: boolean; breathe: SharedValue<number>; blink: SharedValue<number> }) {
  const on = useAnimatedStyle(() => {
    // lit once the rising level passes this step (the first one lights for any level at all)
    const x = v.get() * 10;
    const lit = i === 0 ? interpolate(x, [0.02, 0.1], [0, 1], "clamp") : interpolate(x, [i + 0.3, i + 0.7], [0, 1], "clamp");
    return { opacity: next ? 0.12 + blink.get() * 0.78 : lit * (1 - breathe.get() * 0.55) };
  });
  return (
    <View style={[s.step, { backgroundColor: well }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: fill, borderRadius: 1.5 }, on]} />
    </View>
  );
}

const s = StyleSheet.create({
  pct: { fontFamily: F.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, fontVariant: ["tabular-nums"], marginTop: 2, marginBottom: 8 },
  pctSign: { fontFamily: F.semibold, fontSize: 12 },
  capsule: { width: W, height: 6, borderRadius: 3, overflow: "hidden" },
  capsuleFill: { width: W, height: 6, borderRadius: 3, overflow: "hidden" },
  light: { position: "absolute", top: 0, left: 0 },
  segments: { flexDirection: "row", gap: 2, height: 9 },
  step: { width: 3.4, height: 9, borderRadius: 1.5, overflow: "hidden" },
});
