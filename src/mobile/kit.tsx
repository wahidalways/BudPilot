// Phone and tablet building blocks, from the design (artifacts/shono-mobile-tablet.html). Motion runs on the UI thread
// with Reanimated springs and only moves transform and opacity, so it stays smooth on mid-range phones.
import * as Haptics from "expo-haptics";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, type PressableProps, type StyleProp, StyleSheet, Text, type TextProps, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";

import { F, useColors } from "@/theme";

/** A soft spring with a small overshoot: lenses, gliders, switch knobs. */
export const SPRING = { dampingRatio: 0.72, duration: 520 } as const;
/** Snappier, for press feedback. */
const PRESS = { dampingRatio: 0.6, duration: 260 } as const;

export const T = StyleSheet.create({
  big: { fontFamily: F.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  hello: { fontFamily: F.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.5 },
  head: { fontFamily: F.display, fontSize: 15, lineHeight: 20 },
  name: { fontFamily: F.display, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: F.regular, fontSize: 15, lineHeight: 21 },
  strong: { fontFamily: F.medium, fontSize: 15, lineHeight: 21 },
  sub: { fontFamily: F.regular, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: F.medium, fontSize: 12.5, lineHeight: 16 },
});

/** Text in the phone type scale; `sub` is muted unless told otherwise. */
export function Txt({ v = "body", muted, style, ...rest }: TextProps & { v?: keyof typeof T; muted?: boolean }) {
  const c = useColors();
  return <Text {...rest} style={[T[v], { color: (muted ?? v === "sub") ? c.ink2 : c.ink }, style]} />;
}

export const tick = () => void Haptics.selectionAsync().catch(() => {}); // a light tick on a change; some phones have none

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Anything pressable: sinks a little under the finger and springs back. */
export function Press({ style, children, scale = 0.97, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scale?: number; children: ReactNode }) {
  const down = useSharedValue(1);
  const reduce = useReducedMotion();
  const a = useAnimatedStyle(() => ({ transform: [{ scale: down.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      style={[style, a]}
      onPressIn={(e) => {
        if (!reduce) down.set(withSpring(scale, PRESS));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        down.set(withSpring(1, PRESS));
        rest.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[s.card, { backgroundColor: c.raised, borderColor: c.hair }, style]}>{children}</View>;
}

/** A card's heading line: the title, then anything on its right (a chip, a link). */
export function CardHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={s.head}>
      <Txt v="head" style={s.grow} accessibilityRole="header">
        {title}
      </Txt>
      {right}
    </View>
  );
}

/** A segmented control: a recessed well with a lens that glides to the choice. `accent`: the lens is the accent;
 * options with an icon stand it above the label (`tall`). */
export function Seg<V extends string | number>({
  options,
  value,
  onChange,
  label,
  accent,
  small,
  tall,
}: {
  options: { value: V; label: string; icon?: (color: string) => ReactNode }[];
  value: V | undefined;
  onChange: (v: V) => void;
  label: string;
  accent?: boolean;
  small?: boolean;
  tall?: boolean;
}) {
  const c = useColors();
  const [w, setW] = useState(0);
  const pad = small ? 3 : 4;
  const segW = w ? (w - pad * 2) / options.length : 0;
  const i = options.findIndex((o) => o.value === value);
  const x = useSharedValue(0);
  const shown = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!segW || i < 0) return void shown.set(withTiming(0, { duration: 160 }));
    const first = shown.get() === 0;
    x.set(first || reduce ? i * segW : withSpring(i * segW, SPRING));
    shown.set(withTiming(1, { duration: 160 }));
  }, [i, segW, reduce, x, shown]);
  const lens = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateX: x.get() }] }));
  const radius = tall ? 16 : small ? 9 : 12;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[s.seg, { padding: pad, borderRadius: radius + pad, backgroundColor: c.well }]}
    >
      {segW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: pad,
              bottom: pad,
              left: pad,
              width: segW,
              borderRadius: radius,
              backgroundColor: accent ? c.onBg : c.lens,
              borderWidth: accent && c.dark ? 1 : 0,
              borderColor: c.onEdge,
              boxShadow: c.dark ? undefined : "0 1px 2px rgba(16,24,40,0.08), 0 4px 10px rgba(16,24,40,0.08)",
            },
            lens,
          ]}
        />
      )}
      {options.map((o, j) => {
        const on = j === i;
        const color = on ? (accent ? c.onInk : c.ink) : c.ink2;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (on) return;
              tick();
              onChange(o.value);
            }}
            style={[s.segBtn, { minHeight: tall ? 72 : small ? 34 : 40 }]}
          >
            {o.icon?.(color)}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[small ? T.small : T.strong, { fontSize: small ? 13 : 14, color }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** An on/off switch: the knob glides with a spring and stretches while it's held. */
export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const c = useColors();
  const on = useSharedValue(value ? 1 : 0);
  const held = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => on.set(reduce ? (value ? 1 : 0) : withSpring(value ? 1 : 0, SPRING)), [value, reduce, on]);
  const knob = useAnimatedStyle(() => ({
    // 20 px of travel; held, the knob grows 6 px toward the side it's heading to
    transform: [{ translateX: on.get() * 20 - held.get() * 6 * on.get() }],
    width: 26 + held.get() * 6,
  }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPressIn={() => held.set(withTiming(1, { duration: 140 }))}
      onPressOut={() => held.set(withTiming(0, { duration: 180 }))}
      onPress={() => {
        tick();
        onChange(!value);
      }}
      style={[s.switch, { backgroundColor: value ? c.signalFill : c.off }]}
    >
      <Animated.View style={[s.knob, knob]} />
    </Pressable>
  );
}

/** A choice in a row of pills; `add`: an action pill ("+ New"). */
export function Pill({ label, on, onPress, add }: { label: string; on: boolean; onPress: () => void; add?: boolean }) {
  const c = useColors();
  return (
    <Press
      accessibilityRole={add ? "button" : "radio"}
      accessibilityState={add ? undefined : { selected: on }}
      onPress={() => {
        if (on) return;
        tick();
        onPress();
      }}
      style={[
        s.pill,
        add
          ? { backgroundColor: "transparent", borderColor: c.line }
          : on
            ? { backgroundColor: c.onBg, borderColor: c.dark ? c.onEdge : c.onBg }
            : { backgroundColor: c.well, borderColor: "transparent" },
      ]}
    >
      <Text numberOfLines={1} style={[T.strong, { fontSize: 14, color: add ? c.signalInk : on ? c.onInk : c.ink }]}>
        {add ? `+ ${label}` : label}
      </Text>
    </Press>
  );
}

/** A row of pills that wraps (or scrolls sideways, inside a horizontal ScrollView). */
export function Pills({ children }: { children: ReactNode }) {
  return <View style={s.pills}>{children}</View>;
}

export function Button({ label, onPress, kind = "sec", style }: { label: string; onPress: () => void; kind?: "pri" | "sec" | "out" | "danger"; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const look = {
    pri: { bg: c.signalFill, ink: c.onSignal, edge: "transparent" },
    sec: { bg: c.well, ink: c.ink, edge: "transparent" },
    out: { bg: "transparent", ink: c.ink, edge: c.line },
    danger: { bg: "transparent", ink: c.danger, edge: c.danger },
  }[kind];
  return (
    <Press accessibilityRole="button" onPress={onPress} style={[s.btn, { backgroundColor: look.bg, borderColor: look.edge }, style]}>
      <Text style={[T.strong, { fontFamily: F.semibold, color: look.ink }]}>{label}</Text>
    </Press>
  );
}

/** A setting: title, a line about it, and its switch. */
export function ToggleRow({ title, detail, value, onChange, first }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  const c = useColors();
  return (
    <View style={[s.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hair }]}>
      <View style={s.grow}>
        <Txt v="strong">{title}</Txt>
        {detail ? <Txt v="sub">{detail}</Txt> : null}
      </View>
      <Switch value={value} onChange={onChange} label={title} />
    </View>
  );
}

/** A small tinted label: "Keeping ANC Low"; `busy` while Shono is putting something back. */
export function Chip({ children, busy, quiet }: { children: ReactNode; busy?: boolean; quiet?: boolean }) {
  const c = useColors();
  return (
    <View style={[s.chip, { backgroundColor: busy || quiet ? c.well : c.tint }]}>
      <Text numberOfLines={1} style={[T.small, { color: busy || quiet ? c.ink2 : c.signalInk }]}>
        {children}
      </Text>
    </View>
  );
}

/** Fades and rises into place when it first appears; `k` staggers a group (one after another, 60 ms apart). */
export function Rise({ k = 0, children, style }: { k?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    p.set(reduce ? 1 : withDelay(60 + k * 60, withSpring(1, { dampingRatio: 0.9, duration: 560 })));
  }, [p, reduce, k]);
  const a = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: (1 - p.get()) * 14 }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  card: { borderRadius: 22, padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 },
  seg: { flexDirection: "row" },
  segBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 2 },
  switch: { width: 52, height: 32, borderRadius: 16, padding: 3 },
  knob: { height: 26, borderRadius: 13, backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.08)" },
  pill: { height: 38, paddingHorizontal: 15, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: { height: 46, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 8 },
  chip: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: "center", maxWidth: 200 },
});
