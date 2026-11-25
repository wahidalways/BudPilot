// A tablet's Dashboard (the user's pick, 2026-11-24; Bento was tried and removed): every setting inline, nothing behind
// More. Sideways, columns that scroll under a top bar, with App settings in a panel from the right; upright, the
// phone's Home with the cards side by side (the tab bar has the pages). Not connected, the earbuds card says what to do
// and the controls rest: no old values.
import Ionicons from "@expo/vector-icons/Ionicons";
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fnName, gesture } from "@/screens/home/shared";
import type { BudPilot } from "@/screens/home/use-bud-pilot";
import { F, useColors } from "@/theme";

import { FindPage } from "./find";
import { Glass } from "./glass";
import { DeviceCard, Leave, NoiseCard, type TourRefs, useLeaving, Welcome } from "./home";
import { FnGlyph } from "./icons";
import { Card, CardHead, GearButton, Mark, Press, Rise, Seg, Switch, tick, Txt } from "./kit";
import { LatencyCheck } from "./latency";

import { AutoGamesRow, EARS, EqPage, GameEqPicker, notConnectedText, TouchFacts, Turbo, useKeyPicker, WearRow } from "./pages";

type ViewNode = ComponentRef<typeof View>;
export const GAP = 14;
export const EDGE = 28; // the board's side margins sideways

const live = (b: BudPilot) => b.status === "connected" && !!b.state;

/** A control's card while the earbuds aren't connected: its name and what's going on. */
function Rest({ b, title }: { b: BudPilot; title: string }) {
  const { title: what, line } = notConnectedText(b);
  return (
    // fades in where the card was, rather than replacing it in one frame
    <Animated.View entering={FadeIn.duration(220)}>
    <Card>
      <CardHead title={title} />
      <View style={s.rest}>
        <Txt v="strong">{what}</Txt>
        <Txt v="sub">{line}</Txt>
      </View>
    </Card>
    </Animated.View>
  );
}

/** Game mode with everything about it: its switch (on: a solid accent icon tile and delay pill; the card stays glass
 * like the others: a tint looked washed out and a thicker border drew lines at its corners, the user), the delay in the heading, which EQ
 * plays while gaming (one row; a menu beside it), Turn on with games, and the Latency check opening in place. Rows
 * that keep their height, so the card doesn't jump. */
function GameCard({ b, fill }: { b: BudPilot; fill?: boolean }) {
  const c = useColors();
  const g = b.game;
  const on = g.active;
  const [latency, setLatency] = useState(false);
  return (
    <Card style={fill && s.grow}>
      <CardHead title="Game mode" right={<Turbo on={on} />} />
      <View style={s.gameMain}>
        <View style={[s.glyph, { backgroundColor: on ? c.signalFill : c.well }]}>
          <Ionicons name={on ? "game-controller" : "game-controller-outline"} size={24} color={on ? c.onSignal : c.ink2} />
        </View>
        <Txt v="sub" numberOfLines={2} style={s.grow}>
          {on ? "On · sound lines up with what you see" : "Lowest audio delay, for games and videos"}
        </Txt>
        <Switch value={on} onChange={g.setOn} label="Game mode" />
      </View>
      <GameEqPicker b={b} />
      <AutoGamesRow b={b} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: latency }}
        onPress={() => {
          tick();
          setLatency(!latency);
        }}
        style={({ pressed }) => [s.linkRow, { borderTopColor: c.hair }, pressed && { opacity: 0.6 }]}
      >
        <View style={s.grow}>
          <Txt v="strong">Latency check</Txt>
          <Txt v="sub">Hear how much quicker Game mode is</Txt>
        </View>
        <Ionicons name={latency ? "chevron-up" : "chevron-down"} size={18} color={c.ink2} />
      </Pressable>
      {latency && (
        <Animated.View entering={FadeIn.duration(220)}>
          <LatencyCheck gameOn={on} />
        </Animated.View>
      )}
    </Card>
  );
}

/** Touch: Left or Right, then what each gesture does on that earbud, a full-width row each (the gesture on the left,
 * its action on the right); tapping one opens its actions beside it (saved on the earbuds). Reads the same in any
 * width. Then press and hold, calls, and wear detection. `fill`: the rows spread over the height the card is given. */
function TouchCard({ b, tablet, fill }: { b: BudPilot; tablet: boolean; fill?: boolean }) {
  const c = useColors();
  const k = useKeyPicker(b, tablet);
  const [ear, setEar] = useState(1);
  const side = EARS[ear - 1];
  return (
    <Card style={fill && s.grow}>
      {k.sheet}
      <View style={s.touchHead}>
        <Txt v="head" accessibilityRole="header" style={s.grow}>
          Touch controls
        </Txt>
        <View style={s.earSeg}>
          <Seg label="Earbud" small options={EARS.map((e) => ({ value: e.ear, label: e.label }))} value={ear} onChange={setEar} />
        </View>
      </View>
      <View style={[s.keyRows, fill && s.spread]}>
        {k.tapCounts.map((taps) => {
          const fn = k.fnOf(ear, taps);
          const saving = k.isSaving(ear, taps);
          return (
            <Press
              key={taps}
              accessibilityRole="button"
              accessibilityLabel={`${side.label} ${gesture(taps)}: ${fn === undefined ? "not set" : fnName(fn)}. Change`}
              onPress={(ev) => fn !== undefined && k.pick(ear, taps, ev.currentTarget)}
              scale={0.98}
              style={[s.keyRow, { backgroundColor: c.well }]}
            >
              <View style={s.gesture}>
                <Txt v="sub">{gesture(taps)}</Txt>
              </View>
              {fn !== undefined && <FnGlyph fn={fn} color={c.signalInk} size={18} />}
              <Txt v="strong" numberOfLines={1} style={[s.action, { opacity: saving ? 0.6 : 1 }]}>
                {fn === undefined ? "—" : saving ? "Saving…" : fnName(fn)}
              </Txt>
              <Ionicons name="chevron-down" size={15} color={c.ink2} />
            </Press>
          );
        })}
      </View>
      <View style={[s.facts, { borderTopColor: c.hair }]}>
        <TouchFacts />
      </View>
      <WearRow b={b} />
    </Card>
  );
}

/** The Dashboard. Sideways, three columns (two under 1100 wide): the earbuds and Find; noise and the EQ (drag the
 * curve; Save and a ⋯ menu in its heading); Game and Touch. It scrolls. Upright: the phone's Home: noise and Game side
 * by side, then the EQ, Touch and Find across. `width`: the board's. */
export function DashboardBoard({ b, sideways, width, refs, tablet }: { b: BudPilot; sideways: boolean; width: number; refs?: TourRefs; tablet: boolean }) {
  const on = live(b);
  // upright, the controls fade out in place when the earbuds go, then make room (as on a phone's Home)
  const { shown, leaving } = useLeaving(on);
  // each card sits in a View the tour can find (collapsable: kept as a real view, so it can be measured)
  // sideways, each column ends with the others: the earbuds card, the EQ card and the touch list take up what their
  // column is short of the tallest (the earbuds centre in it, the curve grows, the gestures spread)
  const device = (
    <View key="device" ref={refs?.device} collapsable={false} style={sideways && s.grow}>
      <DeviceCard b={b} photos={1.15} fill={sideways} holding={!sideways && leaving} />
    </View>
  );
  // sideways a card turns into its "Waiting" placeholder at once (which fades in); upright it's held while it fades
  const controls = sideways ? on : shown && !!b.state;
  const noise = (
    <View key="noise" ref={refs?.noise} collapsable={false} style={!sideways && s.grow}>
      {controls ? <NoiseCard b={b} footer notice fill={!sideways} /> : <Rest b={b} title="Noise control" />}
    </View>
  );
  const eq = (
    <View key="eq" ref={refs?.eq} collapsable={false} style={sideways && s.grow}>
      {controls ? <EqPage b={b} ui={{ tablet }} one fill={sideways} /> : <Rest b={b} title="Equalizer" />}
    </View>
  );
  const game = (
    <View key="game" ref={refs?.game} collapsable={false} style={!sideways && s.grow}>
      {controls ? <GameCard b={b} fill={!sideways} /> : <Rest b={b} title="Game mode" />}
    </View>
  );
  const touch = (touchFill: boolean) => (
    <View key="touch" ref={refs?.touch} collapsable={false} style={touchFill && s.grow}>
      {controls ? <TouchCard b={b} tablet={tablet} fill={touchFill} /> : <Rest b={b} title="Touch controls" />}
    </View>
  );
  const find = <FindPage key="find" b={b} wide={!sideways} />;

  if (sideways) {
    // two columns (a small tablet): about the same length, so neither leaves a long empty stretch
    const cols = width >= 1100 ? [[device, find], [noise, eq], [game, touch(true)]] : [[device, noise, find], [eq, game, touch(false)]];
    return (
      <View ref={refs?.stack} collapsable={false} style={s.row}>
        {cols.map((col, i) => (
          <View key={i} style={[s.grow, s.col]}>
            {col}
          </View>
        ))}
      </View>
    );
  }
  // upright: as on a phone, the controls show while connected, Find either way. Noise and Game side by side; the EQ,
  // Touch and Find have the full width (the curve and the two earbuds need it)
  return (
    <View ref={refs?.stack} collapsable={false} style={s.col}>
      <Welcome b={b} />
      {device}
      {controls && (
        <Leave leaving={leaving}>
          <View style={s.col}>
            {/* side by side, the same height: noise spreads its parts, Game keeps its own */}
            <View style={s.row}>
              {noise}
              {game}
            </View>
            {eq}
            {touch(false)}
          </View>
        </Leave>
      )}
      {/* fades with them, then rises in its new place (a new key: Rise plays when it mounts) */}
      <Leave key={controls ? "with" : "alone"} leaving={leaving}>
        <Rise k={controls ? 0 : 2}>{find}</Rise>
      </Leave>
    </View>
  );
}

/** The sideways top bar: Shono, the welcome, and the gear (App settings). */
export function TabletBar({ b, onGear, gearRef, attention }: { b: BudPilot; onGear: () => void; gearRef: RefObject<ViewNode | null>; attention: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingTop: insets.top, height: insets.top + 76, paddingLeft: EDGE + insets.left, paddingRight: EDGE + insets.right }]}>
      <Mark size={34} />
      <Text style={[s.brand, { color: c.ink }]}>Shono</Text>
      <View style={[s.divider, { backgroundColor: c.hair }]} />
      <View style={s.grow}>
        <Welcome b={b} compact />
      </View>
      <GearButton onPress={onGear} attention={attention} size={38} viewRef={gearRef} />
    </View>
  );
}

/** A page over the board, from the right (sideways tablets): App settings. Tap outside, the close button or Back
 * closes it; it stays on screen while it slides away. */
export function SidePanel({ open, title, lede, onClose, target, children }: { open: boolean; title: string; lede?: string; onClose: () => void; target: RefObject<ViewNode | null>; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(open); // kept on screen while the panel slides away
  if (open && !shown) setShown(true);
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(reduce ? (open ? 1 : 0) : open ? withSpring(1, { dampingRatio: 0.9, duration: 420 }) : withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }));
    if (open) return;
    const t = setTimeout(() => setShown(false), reduce ? 0 : 240);
    return () => clearTimeout(t);
  }, [open, reduce, p]);
  const w = Math.min(560, Math.round(width * 0.45));
  const scrim = useAnimatedStyle(() => ({ opacity: p.get() * 0.45 }));
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - p.get()) * (w + 30) }] }));
  if (!open && !shown) return null; // `open` itself shows it (see Sheet: a set made while rendering can be dropped)
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#06080E" }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
      </Animated.View>
      <Animated.View accessibilityViewIsModal style={[s.panel, { width: w, borderLeftColor: c.hair }, slide]}>
        <Glass target={target} radius={0} flat fill={c.dark ? "rgba(14, 15, 18, 0.94)" : "rgba(244, 246, 250, 0.94)"} style={StyleSheet.absoluteFill} />
        <View style={[s.panelHead, { paddingTop: insets.top + 16 }]}>
          <Txt v="big" accessibilityRole="header" numberOfLines={1} style={s.grow}>
            {title}
          </Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={6} onPress={onClose} style={[s.close, { backgroundColor: c.well }]}>
            <Ionicons name="close" size={22} color={c.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[s.panelBody, { paddingBottom: insets.bottom + 28, paddingRight: 20 + insets.right }]}>
          {lede ? (
            <Txt v="sub" style={s.lede}>
              {lede}
            </Txt>
          ) : null}
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: GAP },
  col: { gap: GAP },
  rest: { justifyContent: "center", gap: 2, minHeight: 56 },
  gameMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  glyph: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  touchHead: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 28 },
  earSeg: { width: 172 },
  keyRows: { gap: 8 },
  spread: { flex: 1, justifyContent: "space-evenly" },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 14 },
  gesture: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  action: { fontSize: 14.5, flexShrink: 1, maxWidth: "62%" },
  facts: { paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  bar: { flexDirection: "row", alignItems: "center", gap: 12 },
  brand: { fontFamily: F.display, fontSize: 20, letterSpacing: -0.3 },
  divider: { width: StyleSheet.hairlineWidth, height: 32, marginHorizontal: 6 },
  panel: { position: "absolute", top: 0, right: 0, bottom: 0, borderLeftWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 6 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  panelBody: { paddingLeft: 20, paddingTop: 4, gap: 12 },
  lede: { fontSize: 14, marginBottom: 4 },
});
