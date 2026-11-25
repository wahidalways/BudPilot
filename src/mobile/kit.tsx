// Phone and tablet building blocks, from the design (artifacts/shono-mobile-tablet.html). Motion runs on the UI thread
// with Reanimated springs and only moves transform and opacity, so it stays smooth on mid-range phones.
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Children, type ComponentProps, type ComponentRef, isValidElement, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Pressable, type PressableProps, ScrollView, type StyleProp, StyleSheet, Text, type TextProps, View, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";

import { F, useColors } from "@/theme";
import { BudsIcon } from "@/ui/icons";

import { groundOf, useSurface } from "./glass";

/** A quick spring with a small overshoot: lenses, gliders, switch knobs. */
export const SPRING = { dampingRatio: 0.68, duration: 380 } as const;
/** Snappier, for press feedback. */
const PRESS = { dampingRatio: 0.55, duration: 190 } as const;
const REVERT_MS = 3500; // a switch's tap not taken this long (past an earbuds command's 3 s wait) shows the truth again

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
export function Press({ style, children, scale = 0.96, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scale?: number; children: ReactNode }) {
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
  const f = useSurface();
  return <View style={[s.card, { backgroundColor: f.bg, borderColor: f.edge, boxShadow: f.shine }, style]}>{children}</View>;
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
  options: { value: V; label: string; icon?: (color: string, on: boolean) => ReactNode }[];
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
  const aim = useRef(-1); // where the lens is heading: a tap sends it at once, before the app has re-rendered
  const at = useRef(-1); // where the value is
  const revert = useRef<ReturnType<typeof setTimeout>>(undefined);
  const glide = (to: number) => {
    aim.current = to;
    x.set(reduce ? to : withSpring(to, SPRING));
  };
  useEffect(() => {
    at.current = segW && i >= 0 ? i * segW : -1;
    if (at.current < 0) return void shown.set(withTiming(0, { duration: 120 }));
    const first = shown.get() === 0;
    if (first) {
      aim.current = at.current;
      x.set(at.current);
    } else if (aim.current !== at.current) glide(at.current);
    shown.set(withTiming(1, { duration: 120 }));
  }, [i, segW, reduce, x, shown]); // eslint-disable-line react-hooks/exhaustive-deps -- glide only uses these
  useEffect(() => () => clearTimeout(revert.current), []);
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
              if (segW ? aim.current === j * segW : on) return; // already there, or already on its way
              tick();
              if (segW) glide(j * segW);
              onChange(o.value);
              // a choice the earbuds didn't take: the lens goes back to what's true (see Switch)
              clearTimeout(revert.current);
              revert.current = setTimeout(() => {
                if (at.current >= 0 && aim.current !== at.current) glide(at.current);
              }, REVERT_MS);
            }}
            style={[s.segBtn, { minHeight: tall ? 72 : small ? 34 : 40 }]}
          >
            {o.icon?.(color, on)}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[small ? T.small : T.strong, { fontSize: small ? 13 : 14, color }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Shono's tagline ("Shono" is "listen" in Bangla). */
export const TAGLINE = "Listen your way.";

/** Shono's mark: two earbuds on the accent. */
export function Mark({ size = 30 }: { size?: number }) {
  const c = useColors();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: c.signalFill, alignItems: "center", justifyContent: "center" }}>
      <BudsIcon color={c.onSignal} size={size * 0.58} strokeWidth={2.4} />
    </View>
  );
}

/** Shono's mark, name and tagline together: the first run's Welcome and the About card in App settings. */
export function Lockup({ size = 30 }: { size?: number }) {
  const c = useColors();
  return (
    <View style={s.lockup} accessible accessibilityRole="header" accessibilityLabel={`Shono. ${TAGLINE}`}>
      <Mark size={size} />
      <View>
        <Text style={[s.lockName, { color: c.ink, fontSize: Math.round(size * 0.63), lineHeight: Math.round(size * 0.74) }]}>Shono</Text>
        <Text style={[s.lockTag, { color: c.ink2 }]}>{TAGLINE}</Text>
      </View>
    </View>
  );
}

/** App settings, at the top right: a round button in the cards' glass that mirrors Shono's mark on the left (both sit
 * 18 in from their edge). `attention`: a dot while something there needs doing; today, Android may pause Shono in the
 * background ("Run without limits" is off while Shono keeps working there). `viewRef`: for the tour's spotlight. */
export function GearButton({ onPress, attention, size = 34, viewRef }: { onPress: () => void; attention?: boolean; size?: number; viewRef?: RefObject<ComponentRef<typeof View> | null> }) {
  const c = useColors();
  const f = useSurface();
  return (
    <View ref={viewRef} collapsable={false}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={attention ? "App settings, needs attention" : "App settings"}
        accessibilityHint={attention ? "Run without limits is off, so Android may pause Shono in the background" : undefined}
        hitSlop={8}
        scale={0.9}
        onPress={onPress}
        style={[s.gear, { width: size, height: size, borderRadius: size / 2, backgroundColor: f.bg, borderColor: f.edge }]}
      >
        <Ionicons name="settings-outline" size={Math.round(size * 0.56)} color={c.ink} />
      </Press>
      {attention && <View pointerEvents="none" style={[s.gearDot, { backgroundColor: c.warn, borderColor: groundOf(c) }]} />}
    </View>
  );
}

/** An on/off switch: the knob glides with a spring and stretches while it's held. Knob and track answer the tap on the
 * UI thread at once; the app's re-render (a whole-app one for the look settings) follows. */
export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const c = useColors();
  const on = useSharedValue(value ? 1 : 0);
  const held = useSharedValue(0);
  const reduce = useReducedMotion();
  const want = useRef(value); // the latest tap's value: a second tap before the re-render flips it back, not again
  const latest = useRef(value);
  const revert = useRef<ReturnType<typeof setTimeout>>(undefined);
  const slide = (v: boolean) => on.set(reduce ? (v ? 1 : 0) : withSpring(v ? 1 : 0, SPRING));
  useEffect(() => {
    latest.current = value;
    if (want.current === value) return; // the tap's value arrived: the knob is already on its way
    want.current = value;
    slide(value);
  }, [value, reduce, on]); // eslint-disable-line react-hooks/exhaustive-deps -- slide only uses these
  useEffect(() => () => clearTimeout(revert.current), []);
  const offColor = c.off;
  const onColor = c.signalFill;
  const knob = useAnimatedStyle(() => ({
    // 20 px of travel; held, the knob grows 6 px toward the side it's heading to
    transform: [{ translateX: on.get() * 20 - held.get() * 6 * on.get() }],
    width: 26 + held.get() * 6,
  }));
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(Math.min(1, Math.max(0, on.get())), [0, 1], [offColor, onColor]) }));
  return (
    <AnimatedPressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPressIn={() => held.set(withTiming(1, { duration: 100 }))}
      onPressOut={() => held.set(withTiming(0, { duration: 140 }))}
      onPress={() => {
        const next = !want.current;
        want.current = next;
        slide(next);
        tick();
        onChange(next);
        // a change that was refused or is still being asked about (Last seen asks first; the earbuds can say no):
        // the knob goes back to what's true
        clearTimeout(revert.current);
        revert.current = setTimeout(() => {
          if (want.current === latest.current) return;
          want.current = latest.current;
          slide(latest.current);
        }, REVERT_MS);
      }}
      style={[s.switch, track]}
    >
      <Animated.View style={[s.knob, knob]} />
    </AnimatedPressable>
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

/** A setting: title, a line about it, and its switch. `icon`: a glyph in a round well before it, lit while it's on. */
export function ToggleRow({
  title,
  detail,
  value,
  onChange,
  first,
  icon,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  first?: boolean;
  icon?: ComponentProps<typeof Ionicons>["name"];
}) {
  const c = useColors();
  return (
    <View style={[s.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hair }]}>
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: value ? c.tint : c.well }]}>
          <Ionicons name={icon} size={18} color={value ? c.signalInk : c.ink2} />
        </View>
      )}
      <View style={s.grow}>
        <Txt v="strong">{title}</Txt>
        {detail ? <Txt v="sub">{detail}</Txt> : null}
      </View>
      <Switch value={value} onChange={onChange} label={title} />
    </View>
  );
}

const FADE = 56; // a pill under a row's fading edge doesn't count as in view

/** A row that scrolls sideways (EQ pills, Game EQ chips) and shows there's more: where it continues, the edge fades and
 * a small arrow scrolls it on; both go once that end is reached (the user: people must see they can swipe for more).
 * It reaches the card's edges (`edge`: the card's padding), so the pills run under them. */
export function ScrollRow({ children, edge = 16, label }: { children: ReactNode; edge?: number; label?: string }) {
  const c = useColors();
  const row = useRef<ComponentRef<typeof ScrollView>>(null);
  const [w, setW] = useState(0);
  const [content, setContent] = useState(0);
  const [x, setX] = useState(0);
  const scrollX = useRef(0);
  // the chosen pill (the child whose `on` is true) stays in view: on opening the row scrolls straight to it, and to a
  // new choice made elsewhere it glides (the user: with several EQs, the one playing was off the end of the row)
  const kids = Children.toArray(children);
  const chosen = kids.findIndex((k) => isValidElement<{ on?: boolean }>(k) && !!k.props.on);
  const spots = useRef<{ x: number; w: number }[]>([]);
  const [laid, setLaid] = useState(0); // bumped when the chosen pill has its place
  const seen = useRef(false);
  useEffect(() => {
    const p = spots.current[chosen];
    if (chosen < 0 || !p || !w) return;
    const inView = p.x >= scrollX.current + FADE && p.x + p.w <= scrollX.current + w - FADE;
    if (!inView) row.current?.scrollTo({ x: Math.max(0, p.x + p.w / 2 - w / 2), animated: seen.current });
    seen.current = true;
  }, [chosen, laid, w]);
  const after = content - w - x > 4;
  const before = x > 4;
  const by = (dir: number) => row.current?.scrollTo({ x: Math.max(0, scrollX.current + dir * w * 0.7), animated: true });
  // the fade ends in the card's colour (solid enough to read the arrow over it)
  const solid = c.dark ? "rgba(24, 26, 31," : "rgba(250, 251, 253,";
  const side = (dir: number) => (
    <View pointerEvents="box-none" style={[s.fade, dir < 0 ? s.fadeLeft : s.fadeRight, { backgroundImage: `linear-gradient(to ${dir < 0 ? "right" : "left"}, ${solid} 0.96) 40%, ${solid} 0))` }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dir < 0 ? "Scroll back" : "More"}
        hitSlop={8}
        onPress={() => {
          tick();
          by(dir);
        }}
        style={({ pressed }) => [s.arrow, { backgroundColor: pressed ? c.hair : c.well, borderColor: c.hair }]}
      >
        <Ionicons name={dir < 0 ? "chevron-back" : "chevron-forward"} size={15} color={c.ink} />
      </Pressable>
    </View>
  );
  return (
    <View
      style={{ marginHorizontal: -edge }}
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        setX(scrollX.current); // `x` may lag between the ends (below); the fades need the real place now
      }}
    >
      <ScrollView
        ref={row}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={label}
        contentContainerStyle={[s.scrollRow, { paddingHorizontal: edge }]}
        onContentSizeChange={(cw) => {
          setContent(cw);
          setX(scrollX.current);
        }}
        onScroll={(e) => {
          const v = (scrollX.current = e.nativeEvent.contentOffset.x);
          // only when a fade comes or goes: setting it on every scroll event re-rendered the row and its chips ~30
          // times a second while swiping
          if (v > 4 !== x > 4 || content - w - v > 4 !== content - w - x > 4) setX(v);
        }}
        scrollEventThrottle={32}
      >
        {kids.map((k, i) => (
          <View
            key={isValidElement(k) && k.key != null ? k.key : i}
            onLayout={(e) => {
              spots.current[i] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
              if (i === chosen) setLaid((n) => n + 1);
            }}
          >
            {k}
          </View>
        ))}
      </ScrollView>
      {before && side(-1)}
      {after && side(1)}
    </View>
  );
}

/** A way to a fuller page, in the accent with a chevron: "Edit ›" on the EQ, "More ›" on a tablet's tiles. */
export function Link({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  const c = useColors();
  return (
    <Press accessibilityRole="link" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} hitSlop={10} style={s.link}>
      <Txt v="strong" style={{ color: c.signalInk, fontSize: 14 }}>
        {label}
      </Txt>
      <Ionicons name="chevron-forward" size={15} color={c.signalInk} />
    </Press>
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

/** Fades and rises into place when it first appears; `k` staggers a group (one after another, 40 ms apart). */
export function Rise({ k = 0, children, style }: { k?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    p.set(reduce ? 1 : withDelay(20 + k * 40, withSpring(1, { dampingRatio: 0.78, duration: 420 })));
  }, [p, reduce, k]);
  const a = useAnimatedStyle(() => ({ opacity: Math.min(1, p.get() * 1.4), transform: [{ translateY: (1 - p.get()) * 12 }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  lockup: { flexDirection: "row", alignItems: "center", gap: 10 },
  lockName: { fontFamily: F.display, letterSpacing: -0.3 },
  lockTag: { fontFamily: F.medium, fontSize: 12.5, lineHeight: 16 },
  gear: { borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  gearDot: { position: "absolute", top: -1, right: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
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
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  chip: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: "center", maxWidth: 200 },
  link: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 32 },
  scrollRow: { gap: 8 },
  fade: { position: "absolute", top: 0, bottom: 0, width: 64, justifyContent: "center" },
  fadeLeft: { left: 0, alignItems: "flex-start", paddingLeft: 8 },
  fadeRight: { right: 0, alignItems: "flex-end", paddingRight: 8 },
  arrow: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
});
