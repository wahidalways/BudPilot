import { type ComponentRef, type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Ionicons from "@expo/vector-icons/Ionicons";

import { useColors } from "@/theme";

import { Txt } from "./kit";

/** A bottom sheet on phones (drag it down, tap outside or press Back to close) and a centred dialog on tablets. Declared
 * where it's used, so its content is always current; it stays on screen while it slides away. */
export function Sheet({
  open: isOpen,
  title,
  sub,
  onClose,
  tablet,
  children,
}: {
  open: boolean;
  title: string;
  sub?: string;
  onClose: () => void;
  tablet: boolean;
  children: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // on screen while open, and kept while it slides away. Shown from `isOpen` itself: React can drop a set made while
  // rendering when the same state has a waiting update (the closed sheet's timer leaves one), which hid "Save as…"
  // one frame after it opened
  const [kept, setKept] = useState(isOpen);
  if (isOpen && !kept) setKept(true);
  const visible = isOpen || kept;
  const [h, setH] = useState(600);
  const open = useSharedValue(0);
  const drag = useSharedValue(0);
  useEffect(() => {
    drag.set(0);
    open.set(
      isOpen
        ? reduce
          ? withTiming(1, { duration: 1 })
          : withSpring(1, { dampingRatio: 0.8, duration: 400 })
        : withTiming(0, { duration: reduce ? 1 : 190, easing: Easing.in(Easing.cubic) }),
    );
    if (!isOpen) {
      const t = setTimeout(() => setKept(false), 260);
      return () => clearTimeout(t);
    }
  }, [isOpen, reduce, open, drag]);

  // drag down to close: past 90 px or a quick flick closes, otherwise it springs back
  const [dismissed, setDismissed] = useState(0); // bumped by a drag that should close the sheet
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (dismissed) close();
  }, [dismissed]);
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => drag.set(g.dy > 0 ? g.dy : g.dy / 4),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.7) setDismissed((n) => n + 1);
        else drag.set(withSpring(0, { dampingRatio: 0.78, duration: 300 }));
      },
    }),
  );

  const scrim = useAnimatedStyle(() => ({ opacity: open.get() * 0.45 }));
  const panel = useAnimatedStyle(() =>
    tablet
      ? { opacity: open.get(), transform: [{ scale: 0.96 + open.get() * 0.04 }] }
      : { transform: [{ translateY: (1 - open.get()) * (h + 24) + Math.max(-40, drag.get()) }] },
  );
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#06080E" }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        onLayout={(e) => setH(e.nativeEvent.layout.height)}
        style={[
          tablet ? s.dialog : [s.sheet, { paddingBottom: insets.bottom + 18 }],
          { backgroundColor: c.dark ? c.raised : c.surface, borderColor: c.hair },
          panel,
        ]}
      >
        <View {...(tablet ? {} : pan.panHandlers)} style={s.grabZone}>
          {!tablet && <View style={[s.grabber, { backgroundColor: c.line }]} />}
          <Txt v="name" style={s.title} accessibilityRole="header">
            {title}
          </Txt>
          {sub ? (
            <Txt v="sub" style={s.sub}>
              {sub}
            </Txt>
          ) : null}
        </View>
        <View style={s.body}>{children}</View>
      </Animated.View>
      </View>
    </Modal>
  );
}

/** Where something is on screen (measureInWindow). */
export type Anchor = { x: number; y: number; w: number; h: number };

/** A small menu beside what was tapped (tablets): below it when there's room, otherwise above, kept on screen. Tap
 * outside or press Back to close; it grows from the side it opens on, and stays while it fades away. Placed against
 * its own window's corner, measured the same way as the anchor (Android may measure from below the status bar). */
export function Popover({ anchor, label, onClose, width = 264, children }: { anchor?: Anchor; label: string; onClose: () => void; width?: number; children: ReactNode }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const { width: W, height: H } = useWindowDimensions();
  const [kept, setKept] = useState(anchor); // the last place, kept while it closes
  if (anchor && anchor !== kept) setKept(anchor);
  const shown = anchor ?? kept; // from `anchor` itself while open (see Sheet: a set made while rendering can be dropped)
  const open = !!anchor;
  const root = useRef<ComponentRef<typeof View>>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number }>();
  const [h, setH] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(reduce ? (open ? 1 : 0) : open ? withSpring(1, { dampingRatio: 0.82, duration: 280 }) : withTiming(0, { duration: 130 }));
    if (open) return;
    const t = setTimeout(() => setKept(undefined), reduce ? 0 : 150);
    return () => clearTimeout(t);
  }, [open, reduce, p]);
  const grow = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scale: 0.94 + p.get() * 0.06 }] }));
  if (!shown) return null;
  // below what was tapped if it fits; otherwise beside it (left, then right), centred on it; otherwise above
  const ax = shown.x - (origin?.x ?? 0);
  const ay = shown.y - (origin?.y ?? 0);
  const below = ay + shown.h + 6;
  const fitsBelow = !h || below + h <= H - 12;
  const side = fitsBelow ? undefined : ax - width - 8 >= 12 ? ax - width - 8 : ax + shown.w + 8 + width <= W - 12 ? ax + shown.w + 8 : undefined;
  const up = !fitsBelow && side === undefined;
  const top = fitsBelow ? below : up ? Math.max(12, ay - h - 6) : Math.min(Math.max(12, ay + shown.h / 2 - h / 2), H - h - 12);
  const left = side ?? Math.min(Math.max(12, ax), W - width - 12);
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View
        ref={root}
        collapsable={false}
        style={StyleSheet.absoluteFill}
        pointerEvents={open ? "auto" : "none"}
        onLayout={() => root.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
      >
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          onLayout={(e) => setH(e.nativeEvent.layout.height)}
          style={[
            s.pop,
            { left, top, width, backgroundColor: c.dark ? c.raised : c.surface, borderColor: c.hair, transformOrigin: fitsBelow ? "top" : up ? "bottom" : side! < ax ? "right" : "left" },
            origin ? grow : s.hidden,
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Where `target` (what was tapped: an event's currentTarget) is, for a Popover beside it; false where it can't be
 * measured (then open something else, a sheet). */
export function measureAnchor(target: unknown, done: (a: Anchor) => void): boolean {
  const t = target as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null | undefined;
  if (typeof t?.measureInWindow !== "function") return false;
  t.measureInWindow((x, y, w, h) => done({ x, y, w, h }));
  return true;
}

/** A row in a Popover: an icon, its label, and a tick on the current choice (`on`; a choice is a radio, an action a
 * button). `danger`: Delete. */
export function MenuRow({ label, icon, on, danger, onPress }: { label: string; icon?: ReactNode; on?: boolean; danger?: boolean; onPress: () => void }) {
  const c = useColors();
  const color = danger ? c.danger : on ? c.signalInk : c.ink;
  return (
    <Pressable
      accessibilityRole={on === undefined ? "button" : "radio"}
      accessibilityState={on === undefined ? undefined : { selected: on }}
      onPress={onPress}
      style={({ pressed }) => [s.menuRow, (on || pressed) && { backgroundColor: on ? c.tint : c.well }]}
    >
      {icon}
      <Txt v="strong" numberOfLines={1} style={[s.grow, { color }]}>
        {label}
      </Txt>
      {on && <Ionicons name="checkmark" size={18} color={c.signalInk} />}
    </Pressable>
  );
}

/** A short note that drops in from the top, then leaves by itself. */
export function Toast({ note }: { note: { title: string; sub: string; at: number } | undefined }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(note);
  if (note && note.at !== shown?.at) setShown(note); // a new note (the object itself is new on every render)
  const at = shown?.at;
  const p = useSharedValue(0);
  useEffect(() => {
    if (at === undefined) return;
    p.set(reduce ? 1 : withSpring(1, { dampingRatio: 0.66, duration: 460 }));
    const t = setTimeout(() => p.set(withTiming(0, { duration: 200 })), 2800);
    return () => clearTimeout(t);
  }, [at, reduce, p]);
  const a = useAnimatedStyle(() => ({ opacity: Math.min(1, p.get() * 1.6), transform: [{ translateY: (p.get() - 1) * 90 }, { scale: 0.9 + p.get() * 0.1 }] }));
  if (!shown) return null;
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[s.toast, { top: insets.top + 8, backgroundColor: c.dark ? "#2A2E36" : c.ink }, a]}>
      <Txt v="strong" style={{ color: c.dark ? c.ink : c.raised, fontSize: 14 }}>
        {shown.title}
      </Txt>
      <Txt v="sub" style={{ color: c.dark ? c.ink2 : "rgba(255,255,255,0.72)", fontSize: 12 }}>
        {shown.sub}
      </Txt>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  sheet: { position: "absolute", left: 8, right: 8, bottom: 8, maxHeight: "86%", borderTopLeftRadius: 30, borderTopRightRadius: 30, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, borderWidth: StyleSheet.hairlineWidth },
  dialog: { position: "absolute", alignSelf: "center", top: "16%", width: 460, maxWidth: "90%", maxHeight: "72%", borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, paddingBottom: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" },
  grabZone: { paddingTop: 10, paddingHorizontal: 22, paddingBottom: 6 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { fontSize: 19, lineHeight: 25 },
  sub: { marginTop: 4, fontSize: 13.5 },
  body: { paddingHorizontal: 22, paddingTop: 10, flexShrink: 1 },
  pop: { position: "absolute", padding: 6, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, boxShadow: "0 16px 40px rgba(0,0,0,0.3)" },
  hidden: { opacity: 0 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46, paddingHorizontal: 12, borderRadius: 12 },
  grow: { flex: 1, minWidth: 0 },
  toast: { position: "absolute", alignSelf: "center", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 22, alignItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
});
