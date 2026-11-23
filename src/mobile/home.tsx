// The earbuds at a glance: the phone's Home tab, and the earbuds pane beside the pages on a tablet.
import { type ComponentRef, type RefObject, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { usingSample } from "@/ble/connect";
import { ancOn } from "@/hooks/use-earbuds";
import { ANC_LEVELS } from "@/hooks/use-adaptive-anc";
import type { Battery } from "@/jieli/earbuds";
import { eqChoices, keepChipParts, STRENGTHS, useJustCorrected } from "@/screens/home/parts";
import { type BudPilot, modeName } from "@/screens/home/use-bud-pilot";
import { F, useColors } from "@/theme";
import { BoltIcon, NavIcon, NoiseIcon } from "@/ui/icons";
import { seconds, today } from "@/utils/corrections";
import { loadPref, savePref } from "@/utils/prefs";

import { brandOf, ChevronRight, PHOTOS } from "./art";
import { Button, Card, CardHead, Chip, Pill, Press, Rise, Seg, Switch, T, tick, Txt } from "./kit";

const SEEN_KEY = "budpilot.seenHome";
// Adaptive needs the phone's microphone, which comes in the next version
export const PHONE_STRENGTHS = STRENGTHS.filter((o) => o.value !== "adaptive");

/** "Welcome to Shono" the first time, "Welcome back" after; the line under it says how the earbuds are. */
export function Welcome({ b }: { b: BudPilot }) {
  const [first] = useState(() => !loadPref<boolean>(SEEN_KEY));
  useEffect(() => savePref(SEEN_KEY, true), []);
  const line = usingSample()
    ? "Sample earbuds: Expo Go has no Bluetooth."
    : b.status === "connected"
      ? "Your earbuds are connected and ready."
      : b.status === "connecting"
        ? "Connecting to your earbuds…"
        : "Your earbuds aren't connected yet.";
  return (
    <View style={s.hello}>
      <Txt v="hello" accessibilityRole="header">
        {first ? "Welcome to Shono" : "Welcome back"}
      </Txt>
      <Txt v="sub" style={s.helloSub}>
        {line}
      </Txt>
    </View>
  );
}

/** One battery: photo over a soft shadow, the name (and a bolt while charging), the percent, and a bar that eases to
 * the level. The card itself stays still (the user's rule for the device card). */
function Bud({ label, level, photo, tall, live }: { label: string; level: Battery; photo: number; tall?: boolean; live: boolean }) {
  const c = useColors();
  const on = live && !!level;
  const pct = on ? level!.percent : 0;
  const tone = !on ? c.ink2 : level!.charging ? c.ok : pct <= 10 ? c.danger : pct <= 20 ? c.warn : c.ink;
  const fill = on && level!.charging ? c.ok : pct <= 10 ? c.danger : pct <= 20 ? c.warn : c.signal;
  const w = useSharedValue(0);
  useEffect(() => w.set(withTiming(pct / 100, { duration: 700, easing: Easing.out(Easing.cubic) })), [pct, w]);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: w.get() }] }));
  return (
    <View style={s.bud} accessible accessibilityLabel={`${label} battery ${on ? `${pct} percent${level!.charging ? ", charging" : ""}` : "not available"}`}>
      <View style={[s.ph, { height: tall ? 104 : 96 }]}>
        <View style={[s.shadow, { backgroundColor: c.dark ? "rgba(0,0,0,0.55)" : "rgba(16,24,40,0.14)", boxShadow: `0 0 10px 6px ${c.dark ? "rgba(0,0,0,0.55)" : "rgba(16,24,40,0.14)"}` }]} />
        <Image source={photo} resizeMode="contain" style={[s.photo, { height: tall ? 92 : 90, opacity: live ? 1 : 0.32 }]} />
      </View>
      <View style={s.inline}>
        <Txt v="small" muted>
          {label}
        </Txt>
        {on && level!.charging && <BoltIcon color={c.ok} />}
      </View>
      <Text style={[s.pct, { color: tone }]}>
        {on ? pct : "—"}
        {on && <Text style={[s.pctSign, { color: c.ink2 }]}>%</Text>}
      </Text>
      <View style={s.batt}>
        <View style={[s.battBody, { backgroundColor: c.well }]}>
          <Animated.View style={[s.battFill, { backgroundColor: fill }, bar]} />
        </View>
        <View style={[s.battCap, { backgroundColor: c.line }]} />
      </View>
    </View>
  );
}

/** Name (with its maker's logo), connection, and the three batteries. Not connected, it says what to do. */
export function DeviceCard({ b }: { b: BudPilot }) {
  const c = useColors();
  const live = b.status === "connected" && !!b.state;
  const bat = b.state?.battery;
  const { logo, model } = brandOf(b.state?.name ?? "");
  const status = live ? (b.busy ? "Sending…" : "Connected") : b.status === "connecting" ? "Connecting…" : b.status === "reconnecting" ? "Waiting for your earbuds" : "Not connected";
  return (
    <Card>
      <View>
        <View style={s.inline}>
          {live && logo && <Image source={logo.src} accessibilityLabel="hoco" resizeMode="contain" style={{ height: 13, width: 13 * logo.aspect, tintColor: c.ink, marginRight: 2 }} />}
          <Txt v="name" numberOfLines={1}>
            {live ? model || b.state!.name : "Your earbuds"}
          </Txt>
        </View>
        <View style={[s.inline, { marginTop: 2 }]}>
          {b.status === "connecting" ? <ActivityIndicator size={12} color={c.ink2} /> : <View style={[s.dot, { backgroundColor: live ? c.ok : c.ink2 }]} />}
          <Txt v="small" style={{ color: live ? c.ok : c.ink2 }}>
            {status}
          </Txt>
        </View>
      </View>
      <View style={s.buds}>
        <Bud label="Left" level={bat?.left ?? null} photo={PHOTOS.left} live={live} />
        <Bud label="Case" level={bat?.case ?? null} photo={PHOTOS.case} live={live} tall />
        <Bud label="Right" level={bat?.right ?? null} photo={PHOTOS.right} live={live} />
      </View>
      {!live && (
        <View style={s.waitMsg}>
          <Txt v="sub" style={s.center}>
            {b.status === "idle" ? "Open the case, then connect. Close other apps that control your earbuds first." : "Open the case. Shono connects by itself."}
          </Txt>
          {b.status === "idle" && <Button label="Connect" kind="pri" onPress={() => void b.connect()} />}
          {b.error ? (
            <Txt v="sub" style={[s.center, { color: c.danger }]}>
              {b.error}
            </Txt>
          ) : null}
        </View>
      )}
    </Card>
  );
}

/** "Keeping ANC Low", "Putting Off back", or "Undid ANC 0.12 s" for a moment after a put-back. */
export function KeepChip({ b }: { b: BudPilot }) {
  const parts = keepChipParts(b, useJustCorrected(b.corrections));
  if (!parts) return b.keep ? null : <Chip quiet>Not keeping a setting</Chip>; // nothing chosen yet: nothing to keep
  return <Chip busy={!!b.putting}>{parts.text.join("")}</Chip>;
}

/** Off / ANC / Transparency, then a row that is always the same height: ANC's strength, or a line about the mode. */
export function NoiseCard({ b, compact }: { b: BudPilot; compact?: boolean }) {
  const c = useColors();
  const state = b.state!;
  const pref = b.noisePref;
  const ncLevel = pref?.ncLevel ?? ANC_LEVELS[b.adaptive.current];
  const choose = (m: number) => void b.setNoise(m === 1 ? ancOn() : { mode: m, ncLevel, adaptive: false });
  const modes = [0, 1, 2].filter((m) => state.ancGains[m]);
  return (
    <Card>
      <CardHead title="Noise control" right={<KeepChip b={b} />} />
      <Seg
        label="Noise control"
        accent
        tall
        options={modes.map((m) => ({ value: m, label: modeName(m), icon: (color: string) => <NoiseIcon mode={m} color={color} size={26} /> }))}
        value={state.anc}
        onChange={choose}
      />
      <View style={s.swap}>
        {state.anc === 1 ? (
          <Animated.View key="anc" entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={s.swapRow}>
            {!compact && (
              <Txt v="sub" style={s.swapLabel}>
                Strength
              </Txt>
            )}
            <View style={s.grow}>
              <Seg
                label="ANC strength"
                small
                options={PHONE_STRENGTHS}
                value={String(b.adaptive.current)}
                onChange={(v) => void b.setNoise({ mode: 1, ncLevel: ANC_LEVELS[Number(v)], adaptive: false })}
              />
            </View>
          </Animated.View>
        ) : (
          <Animated.View key={`m${state.anc}`} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={s.swapRow}>
            <Txt v="sub" style={s.grow}>
              {state.anc === 0 ? "Normal listening · press and hold an earbud to cycle" : "Hear the room · voices and traffic come through"}
            </Txt>
          </Animated.View>
        )}
      </View>
      {b.error ? (
        <Txt v="sub" style={{ color: c.danger }}>
          {b.error}
        </Txt>
      ) : null}
    </Card>
  );
}

/** The EQ pills in one scrolling row, and a way to the full EQ page. */
export function EqQuickCard({ b, onEdit }: { b: BudPilot; onEdit: () => void }) {
  const c = useColors();
  return (
    <Card>
      <CardHead
        title="Equalizer"
        right={
          <Press accessibilityRole="link" onPress={onEdit} hitSlop={8} style={s.inline}>
            <Txt v="strong" style={{ color: c.signalInk, fontSize: 14 }}>
              Edit
            </Txt>
            <ChevronRight color={c.signalInk} size={14} />
          </Press>
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.edge} contentContainerStyle={s.pillRow}>
        {eqChoices(b).map((ch) => (
          <Pill key={ch.key} label={ch.label} on={ch.on} onPress={ch.onPress} />
        ))}
      </ScrollView>
    </Card>
  );
}

/** Game mode: its switch, and while it's on, a chip that turns the gaming EQ on and off. */
export function GameCard({ b }: { b: BudPilot }) {
  const c = useColors();
  const g = b.game;
  return (
    <Card>
      <View style={s.row}>
        <View style={[s.glyph, { backgroundColor: g.active ? c.tint : c.well }]}>
          <NavIcon panel="game" color={g.active ? c.signalInk : c.ink2} size={22} />
        </View>
        <View style={s.grow}>
          <Txt v="strong">Game mode</Txt>
          {g.active ? (
            <Animated.View entering={FadeIn.duration(220)} style={s.inline}>
              <Press
                accessibilityRole="switch"
                accessibilityState={{ checked: g.prefs.eqOn }}
                accessibilityLabel={`${g.gameEqName} while gaming`}
                onPress={() => {
                  tick();
                  g.setEqOn(!g.prefs.eqOn);
                }}
                style={[s.gameChip, { backgroundColor: g.prefs.eqOn ? c.tint : c.well }]}
              >
                <Text style={[T.small, { color: g.prefs.eqOn ? c.signalInk : c.ink2 }]}>{g.gameEqName}</Text>
              </Press>
            </Animated.View>
          ) : (
            <Txt v="sub">Lowest audio delay, for games and videos</Txt>
          )}
        </View>
        <Switch value={g.active} onChange={g.setOn} label="Game mode" />
      </View>
    </Card>
  );
}

/** "Undid 3 today · fastest 0.12 s". */
export function HomeFoot({ b }: { b: BudPilot }) {
  const { count, fastestMs } = today(b.corrections);
  return (
    <Txt v="sub" style={s.foot}>
      {count && fastestMs !== undefined ? `Undid ${count} today · fastest ${seconds(fastestMs)}` : "Nothing to undo today"}
    </Txt>
  );
}

/** Where the tour finds Home's cards. */
export type TourRefs = Record<"stack" | "device" | "noise" | "eq" | "game", RefObject<ComponentRef<typeof View> | null>>;

/** Home's cards, rising in one after another. `refs`: for the tour's spotlight. */
export function HomeCards({ b, onEdit, compact, refs }: { b: BudPilot; onEdit: () => void; compact?: boolean; refs?: TourRefs }) {
  const live = b.status === "connected" && !!b.state;
  return (
    <View style={s.stack} ref={refs?.stack} collapsable={false}>
      <Rise k={0}>
        <Welcome b={b} />
      </Rise>
      <Rise k={1}>
        <View ref={refs?.device} collapsable={false}>
          <DeviceCard b={b} />
        </View>
      </Rise>
      {live && (
        <>
          <Rise k={2}>
            <View ref={refs?.noise} collapsable={false}>
              <NoiseCard b={b} compact={compact} />
            </View>
          </Rise>
          <Rise k={3}>
            <View ref={refs?.eq} collapsable={false}>
              <EqQuickCard b={b} onEdit={onEdit} />
            </View>
          </Rise>
          <Rise k={4}>
            <View ref={refs?.game} collapsable={false}>
              <GameCard b={b} />
            </View>
          </Rise>
          <Rise k={5}>
            <HomeFoot b={b} />
          </Rise>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  stack: { gap: 12 },
  hello: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 6 },
  helloSub: { marginTop: 4, fontSize: 14 },
  inline: { flexDirection: "row", alignItems: "center", gap: 5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  buds: { flexDirection: "row", alignItems: "flex-end", gap: 6, paddingTop: 2 },
  bud: { flex: 1, alignItems: "center" },
  ph: { width: "100%", alignItems: "center", justifyContent: "flex-end", marginBottom: 8 },
  photo: { width: "100%" },
  // a soft oval under the photo, as if it stood on the card (a spread shadow: blur filters aren't on every Android)
  shadow: { position: "absolute", bottom: 0, width: "42%", height: 6, borderRadius: 999 },
  pct: { fontFamily: F.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, fontVariant: ["tabular-nums"], marginTop: 2, marginBottom: 7 },
  pctSign: { fontFamily: F.semibold, fontSize: 12 },
  batt: { flexDirection: "row", alignItems: "center", gap: 2 },
  battBody: { width: 50, height: 8, borderRadius: 3, overflow: "hidden" },
  battFill: { width: "100%", height: "100%", borderRadius: 3, transformOrigin: "left" },
  battCap: { width: 2.5, height: 4, borderRadius: 1.5 },
  waitMsg: { gap: 12, paddingTop: 4 },
  swap: { height: 44, justifyContent: "center" },
  swapRow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  swapLabel: { width: 64 },
  edge: { marginHorizontal: -16 },
  pillRow: { gap: 8, paddingHorizontal: 16 },
  glyph: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  gameChip: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: "center", marginTop: 4 },
  foot: { textAlign: "center", paddingVertical: 6 },
});
