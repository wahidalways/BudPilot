// The redesign's building blocks: glass cards and controls, the type scale, the switch.
import { type ReactNode, useState } from "react";
import { Pressable, type StyleProp, StyleSheet, Text, type TextProps, View, type ViewStyle } from "react-native";
import Animated, { cubicBezier } from "react-native-reanimated";

import { type Colors, F, useColors } from "@/theme";

import { BudsIcon } from "./icons";

export const type = StyleSheet.create({
  h1: { fontFamily: F.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  brand: { fontFamily: F.displayBold, fontSize: 15, lineHeight: 18, letterSpacing: -0.15 },
  name: { fontFamily: F.display, fontSize: 14, lineHeight: 18 },
  title: { fontFamily: F.semibold, fontSize: 14, lineHeight: 19 },
  body: { fontFamily: F.regular, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: F.regular, fontSize: 13, lineHeight: 18 },
  sub: { fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: F.semibold, fontSize: 11.5, lineHeight: 14, letterSpacing: 0.7, textTransform: "uppercase" },
  num: { fontFamily: F.medium, fontSize: 16, lineHeight: 20, fontVariant: ["tabular-nums"] },
});

/** Text in the type scale; `sub` and `label` are muted unless told otherwise. */
export function Txt({ v = "body", muted, style, ...rest }: TextProps & { v?: keyof typeof type; muted?: boolean }) {
  const c = useColors();
  const quiet = muted ?? (v === "sub" || v === "label");
  return <Text {...rest} style={[type[v], { color: quiet ? c.ink2 : c.ink }, style]} />;
}

const pressedStyle = { transform: [{ scale: 0.96 }] };
const glassControl = (c: Colors) => ({ backgroundColor: c.card, borderColor: c.stroke, boxShadow: `${c.shine}, ${c.drop}` });
/** A pill's fill: the accent when chosen, glass otherwise. */
export const pillLook = (c: Colors, on: boolean) =>
  on ? { backgroundColor: c.onBg, borderColor: c.onEdge, boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.3), ${c.drop}` } : glassControl(c);

/** A content card: a calm layer of the same glass. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[s.card, { backgroundColor: c.card, borderColor: c.stroke, boxShadow: c.shine }, style]}>{children}</View>;
}

/** One choice of a radio group, as a glass capsule; the chosen one is tinted. */
export function Pill({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      aria-checked={on}
      onPress={on ? undefined : onPress}
      style={({ pressed }) => [
        s.pill,
        pillLook(c, on),
        pressed && pressedStyle,
      ]}
    >
      <Text style={[on ? s.pillOn : s.pillText, { color: on ? c.onInk : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

const GLIDE = cubicBezier(0.25, 0.8, 0.25, 1); // eases out, no overshoot

/** A segmented control: a recessed well with a glass lens that glides to the choice. `fit`: as wide as its labels.
 * Options with an `icon` stand it above the label; `accent`: the lens is tinted with the accent; `small`: 28 px high. */
export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  label,
  fit,
  accent,
  small,
  testIDPrefix,
}: {
  options: { value: T; label: string; icon?: (color: string) => ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  fit?: boolean;
  accent?: boolean;
  small?: boolean;
  testIDPrefix?: string;
}) {
  const c = useColors();
  const [boxes, setBoxes] = useState<Record<string, { x: number; width: number }>>({});
  const lens = boxes[String(value)];
  const tall = options.some((o) => o.icon);
  return (
    <View accessibilityRole="radiogroup" aria-label={label} style={[s.seg, tall && s.segTall, { backgroundColor: c.well }, fit && s.segFit]}>
      {lens && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.lens,
            tall && s.lensTall,
            accent ? { backgroundColor: c.tint, borderColor: c.tintEdge } : { backgroundColor: c.lens, borderColor: "transparent" },
            {
              boxShadow: `${c.shine}, ${c.drop}`,
              width: lens.width,
              transform: [{ translateX: lens.x }],
              transitionProperty: ["transform", "width"],
              transitionDuration: 320,
              transitionTimingFunction: GLIDE,
            },
          ]}
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testIDPrefix && `${testIDPrefix}-${o.value}`}
            accessibilityRole="radio"
            aria-checked={on}
            onPress={on ? undefined : () => onChange(o.value)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              setBoxes((b) => (b[String(o.value)]?.x === x && b[String(o.value)]?.width === width ? b : { ...b, [String(o.value)]: { x, width } }));
            }}
            style={({ pressed }) => [s.segItem, tall && s.segItemTall, small && s.segItemSmall, !fit && s.grow, pressed && pressedStyle]}
          >
            {o.icon?.(on ? (accent ? c.signalInk : c.ink) : c.ink2)}
            <Text style={[on ? s.segOn : s.segText, (tall || small) && s.segTextSmall, { color: on ? c.ink : c.ink2 }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** An on/off switch in iOS proportions; the white knob glides. */
export function Switch({ value, onChange, label, testID }: { value: boolean; onChange: (v: boolean) => void; label: string; testID?: string }) {
  const c = useColors();
  return (
    <Pressable testID={testID} accessibilityRole="switch" aria-checked={value} accessibilityLabel={label} onPress={() => onChange(!value)} hitSlop={6}>
      <Animated.View
        style={[
          s.track,
          { backgroundColor: value ? c.signalFill : c.off, transitionProperty: "backgroundColor", transitionDuration: 200, transitionTimingFunction: "ease" },
        ]}
      >
        <Animated.View
          style={[
            s.knob,
            { transform: [{ translateX: value ? 14 : 0 }], transitionProperty: "transform", transitionDuration: 320, transitionTimingFunction: GLIDE },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

/** A title, a line of detail, and a switch. */
export function ToggleRow({ title, detail, value, onChange, testID }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={s.row}>
      <View style={s.grow}>
        <Txt v="title">{title}</Txt>
        {detail && <Txt v="sub">{detail}</Txt>}
      </View>
      <Switch value={value} onChange={onChange} label={title} testID={testID} />
    </View>
  );
}

/** A tile in a radio group (the settings page's noise control). */
export function Tile({
  on,
  onPress,
  label,
  sub,
  big,
  testID,
}: {
  on: boolean;
  onPress: () => void;
  label: string;
  sub?: string;
  big?: boolean;
  testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      aria-checked={on}
      accessibilityLabel={label}
      onPress={on ? undefined : onPress}
      style={({ pressed }) => [
        s.tile,
        big && s.tileBig,
        on ? { backgroundColor: c.tint, borderColor: c.tintEdge, boxShadow: `${c.shine}, ${c.drop}` } : glassControl(c),
        pressed && pressedStyle,
      ]}
    >
      <Text style={[on ? s.tileOn : s.tileText, big && s.tileTextBig, { color: c.ink }]}>{label}</Text>
      {sub && <Txt v="sub">{sub}</Txt>}
    </Pressable>
  );
}

/** A glass button; `primary` is the accent fill, for the one main action. */
export function Button({ label, onPress, primary, testID }: { label: string; onPress?: () => void; primary?: boolean; testID?: string }) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary ? { backgroundColor: c.signalFill, borderColor: "transparent", boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.3), ${c.drop}` } : glassControl(c),
        pressed && pressedStyle,
      ]}
    >
      <Text style={[s.buttonText, { color: primary ? c.onSignal : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

/** A round glass button with an icon. */
export function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [s.iconButton, glassControl(c), pressed && pressedStyle]}>
      {children}
    </Pressable>
  );
}

/** BudPilot's mark: the two earbuds on the accent. */
export function Mark({ size = 24 }: { size?: number }) {
  const c = useColors();
  return (
    <View style={[s.mark, { width: size, height: size, borderRadius: size * 0.29, backgroundColor: c.signalFill }]}>
      <BudsIcon color={c.onSignal} size={size * 0.62} strokeWidth={size < 20 ? 2.6 : 2.2} />
    </View>
  );
}

export const Dot = ({ color, size = 7 }: { color: string; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
);

const s = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontFamily: F.regular, fontSize: 13, lineHeight: 18 },
  pillOn: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18 },
  seg: { flexDirection: "row", borderRadius: 999, padding: 3, gap: 2, boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.08)" },
  segFit: { alignSelf: "flex-start" },
  segItem: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, alignItems: "center" },
  segText: { fontFamily: F.regular, fontSize: 13, lineHeight: 18 },
  segOn: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18 },
  segTall: { borderRadius: 16 },
  segItemTall: { borderRadius: 13, paddingVertical: 7, paddingHorizontal: 4, gap: 3 },
  segTextSmall: { fontSize: 12, lineHeight: 16 },
  segItemSmall: { paddingVertical: 3, paddingHorizontal: 9 },
  // the lens sits under the items: the well's padding (3) in from its top and bottom, moved across to the choice
  lens: { position: "absolute", top: 3, bottom: 3, left: 0, borderRadius: 999, borderWidth: 1 },
  lensTall: { borderRadius: 13 },
  track: { width: 46, height: 26, borderRadius: 13, boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.14)" },
  knob: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 26,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF", // white in both themes, like iOS
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2), 0 3px 8px rgba(0, 0, 0, 0.12)",
  },
  tile: { flex: 1, borderWidth: 1, borderRadius: 16, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 6, alignItems: "center", gap: 6 },
  tileBig: { paddingVertical: 14, gap: 2 },
  tileText: { fontFamily: F.regular, fontSize: 12, lineHeight: 15, textAlign: "center" },
  tileOn: { fontFamily: F.semibold, fontSize: 12, lineHeight: 15, textAlign: "center" },
  tileTextBig: { fontSize: 14, lineHeight: 19 },
  button: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center", alignSelf: "flex-start" },
  buttonText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18 },
  iconButton: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  mark: { alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 1px 3px rgba(0, 0, 0, 0.15)" },
});
