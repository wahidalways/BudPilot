import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const [visible, setVisible] = useState(isOpen); // stays true while it closes
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setVisible(true);
  }
  const [h, setH] = useState(600);
  const open = useSharedValue(0);
  const drag = useSharedValue(0);
  useEffect(() => {
    drag.set(0);
    open.set(
      isOpen
        ? reduce
          ? withTiming(1, { duration: 1 })
          : withSpring(1, { dampingRatio: 0.82, duration: 520 })
        : withTiming(0, { duration: reduce ? 1 : 240, easing: Easing.in(Easing.cubic) }),
    );
    if (!isOpen) {
      const t = setTimeout(() => setVisible(false), 260);
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
        else drag.set(withSpring(0, { dampingRatio: 0.8, duration: 380 }));
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
    p.set(reduce ? 1 : withSpring(1, { dampingRatio: 0.7, duration: 600 }));
    const t = setTimeout(() => p.set(withTiming(0, { duration: 260 })), 2800);
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
  toast: { position: "absolute", alignSelf: "center", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 22, alignItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
});
