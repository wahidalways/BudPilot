// The earbuds at a glance: the phone's Home tab, and the earbuds pane beside the pages on a tablet.
import { type ComponentRef, type RefObject, useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { usingSample } from "@/ble/connect";
import { ancOn } from "@/hooks/use-earbuds";
import { ANC_LEVELS } from "@/hooks/use-adaptive-anc";
import type { Battery } from "@/jieli/earbuds";
import { eqChoices, keepChipParts, STRENGTHS, useJustCorrected } from "@/screens/home/parts";
import { type BudPilot, modeName } from "@/screens/home/use-bud-pilot";
import { useColors, useTheme } from "@/theme";

import { loadPref, savePref } from "@/utils/prefs";

import Ionicons from "@expo/vector-icons/Ionicons";

import { brandOf, PHOTOS } from "./art";
import { BatteryLevel } from "./battery";
import { FindCard } from "./find";
import { NoiseGlyph } from "./icons";
import { Button, Card, CardHead, Chip, Link, Pill, Press, Rise, ScrollRow, Seg, Switch, T, tick, ToggleRow, Txt } from "./kit";

const SEEN_KEY = "budpilot.seenHome";
/** The first run is over: Home still says "Welcome to Shono" for the rest of this visit, "Welcome back" from the next
 * (noted when the first run ends, not while it's on screen over Home). */
export const markWelcomed = () => savePref(SEEN_KEY, true);
// Adaptive (the room's loudness through a microphone) stays a Windows feature; phones offer Low, Mid and High (the
// user's choice, 2026-11-23)
export const PHONE_STRENGTHS = STRENGTHS.filter((o) => o.value !== "adaptive");

/** "Welcome to Shono" the first time, "Welcome back" after; the line under it says how the earbuds are. `compact`: the
 * sideways tablet's top bar. */
export function Welcome({ b, compact }: { b: BudPilot; compact?: boolean }) {
  const [first] = useState(() => !loadPref<boolean>(SEEN_KEY));
  // someone who finished the first run before this was noted: welcomed now, "Welcome back" from the next visit
  useEffect(() => void (loadPref<boolean>("budpilot.onboarded") && markWelcomed()), []);
  const status = usingSample()
    ? "Sample earbuds: Expo Go has no Bluetooth."
    : b.status === "connected"
      ? "Your earbuds are connected and ready."
      : b.status === "connecting"
        ? "Connecting to your earbuds…"
        : "Your earbuds aren't connected yet.";
  const line = first ? `You're all set. ${status}` : status;
  if (compact)
    return (
      <View>
        <Txt v="head" accessibilityRole="header">
          {first ? "Welcome to Shono" : "Welcome back"}
        </Txt>
        <Txt v="sub">{line}</Txt>
      </View>
    );
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

/** One battery: photo over a soft shadow, the name (and a bolt while charging), then the percent and its bar in the
 * style picked in App settings (battery.tsx). The photos stay still (the user: the earbuds and case never move). */
function Bud({ label, level, photo, tall, live, order, k = 1 }: { label: string; level: Battery; photo: number; tall?: boolean; live: boolean; order: number; k?: number }) {
  const c = useColors();
  const { look } = useTheme();
  const on = live && !!level;
  const pct = on ? level!.percent : 0;
  return (
    <View style={s.bud} accessible accessibilityLabel={`${label} battery ${on ? `${pct} percent${level!.charging ? ", charging" : ""}` : "not available"}`}>
      <View style={[s.ph, { height: (tall ? 104 : 96) * k }]}>
        <View style={[s.shadow, { width: 46 * k, backgroundColor: c.dark ? "rgba(0,0,0,0.55)" : "rgba(16,24,40,0.14)", boxShadow: `0 0 10px 6px ${c.dark ? "rgba(0,0,0,0.55)" : "rgba(16,24,40,0.14)"}` }]} />
        <Image source={photo} resizeMode="contain" style={[s.photo, { height: (tall ? 92 : 90) * k, opacity: live ? 1 : 0.32 }]} />
      </View>
      <View style={s.inline}>
        <Txt v="small" muted>
          {label}
        </Txt>
        {on && level!.charging && <Ionicons name="flash" size={12} color={c.ok} />}
      </View>
      <BatteryLevel kind={look.battery ?? "segments"} live={on} percent={pct} charging={on && level!.charging} order={order} />
    </View>
  );
}

/** Name (with its maker's logo), connection, and the three batteries. Not connected, it says what to do. `photos`: how
 * big the photos are (a tablet's earbuds tile shows them larger); `fill`: the card fills its tile, the earbuds centred. */
export function DeviceCard({ b, photos = 1, fill }: { b: BudPilot; photos?: number; fill?: boolean }) {
  const c = useColors();
  const live = b.status === "connected" && !!b.state;
  const bat = b.state?.battery;
  const { logo, model } = brandOf(b.state?.name ?? "");
  const status = live ? (b.busy ? "Sending…" : "Connected") : b.status === "connecting" ? "Connecting…" : b.status === "reconnecting" ? "Waiting for your earbuds" : "Not connected";
  return (
    <Card style={fill && s.fill}>
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
      <View style={[s.buds, fill && s.budsFill]}>
        <Bud label="Left" level={bat?.left ?? null} photo={PHOTOS.left} live={live} order={0} k={photos} />
        <Bud label="Case" level={bat?.case ?? null} photo={PHOTOS.case} live={live} tall order={1} k={photos} />
        <Bud label="Right" level={bat?.right ?? null} photo={PHOTOS.right} live={live} order={2} k={photos} />
      </View>
      {!live && (
        <View style={s.waitMsg}>
          <Txt v="sub" style={s.center}>
            {b.status === "idle"
              ? "Open the case, then connect. Close other apps that control your earbuds first."
              : b.pcLinked === false
                ? "In the case, or playing on another device. Shono connects when they play on this phone."
                : "Open the case. Shono connects by itself."}
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

/** A tablet's noise card ends with this instead of the chip in its heading (the chip and More collided): the Keep
 * status ("Keeping ANC Low", "Undid Transparency 0.12 s") and its switch, so it can be changed right there. */
function KeepFooter({ b }: { b: BudPilot }) {
  const c = useColors();
  const parts = keepChipParts(b, useJustCorrected(b.corrections));
  return (
    <View style={[s.footer, { borderTopColor: c.hair }]}>
      <Ionicons name={b.keep ? "shield-checkmark" : "shield-outline"} size={18} color={b.keep ? c.signalInk : c.ink2} />
      <Txt v="strong" numberOfLines={1} style={[s.grow, { fontSize: 14, color: parts?.loud ? c.signalInk : c.ink }]}>
        {parts ? parts.text.join("") : "Keep my noise setting"}
      </Txt>
      <Switch value={b.keep} onChange={b.setKeep} label="Keep my noise setting" />
    </View>
  );
}

/** Off / ANC / Transparency, then a row that is always the same height: ANC's strength, or a line about the mode.
 * Tablets (`footer`): More in the heading, Keep at the foot; `notice`: also "Tell me when Shono steps in". */
export function NoiseCard({ b, compact, onMore, fill, footer, notice }: { b: BudPilot; compact?: boolean; onMore?: () => void; fill?: boolean; footer?: boolean; notice?: boolean }) {
  const c = useColors();
  const state = b.state!;
  const pref = b.noisePref;
  const ncLevel = pref?.ncLevel ?? ANC_LEVELS[b.adaptive.current];
  const choose = (m: number) => void b.setNoise(m === 1 ? ancOn() : { mode: m, ncLevel, adaptive: false });
  const modes = [0, 1, 2].filter((m) => state.ancGains[m]);
  return (
    <Card style={fill && [s.fill, s.spread]}>
      <CardHead
        title="Noise control"
        right={
          <View style={s.inline}>
            {!footer && <KeepChip b={b} />}
            {onMore && <Link label="More" accessibilityLabel="Sound settings" onPress={onMore} />}
          </View>
        }
      />
      <Seg
        label="Noise control"
        accent
        tall
        options={modes.map((m) => ({ value: m, label: modeName(m), icon: (color: string, on: boolean) => <NoiseGlyph mode={m} on={on} color={color} size={26} /> }))}
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
      {footer && <KeepFooter b={b} />}
      {notice && <ToggleRow title="Tell me when Shono steps in" detail="When it puts your noise setting back" value={b.notice.on} onChange={b.notice.setOn} />}
    </Card>
  );
}

/** The EQ pills in one scrolling row, and a way to the full EQ page. */
export function EqQuickCard({ b, onEdit }: { b: BudPilot; onEdit: () => void }) {
  return (
    <Card>
      <CardHead title="Equalizer" right={<Link label="Edit" accessibilityLabel="Edit the equalizer" onPress={onEdit} />} />
      <ScrollRow label="Equalizer">
        {eqChoices(b).map((ch) => (
          <Pill key={ch.key} label={ch.label} on={ch.on} onPress={ch.onPress} />
        ))}
      </ScrollRow>
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
          <Ionicons name={g.active ? "game-controller" : "game-controller-outline"} size={22} color={g.active ? c.signalInk : c.ink2} />
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

/** Where the tour finds Home's cards. */
export type TourRefs = Record<"stack" | "device" | "noise" | "eq" | "game" | "touch", RefObject<ComponentRef<typeof View> | null>>;

/** Home's cards, rising in one after another. `refs`: for the tour's spotlight. */
/** `onFind`: a phone's way into Find my earbuds (tablets have it in the rail). Shown connected or not: Last seen is
 * for when they're gone. */
export function HomeCards({ b, onEdit, onFind, compact, refs }: { b: BudPilot; onEdit: () => void; onFind?: () => void; compact?: boolean; refs?: TourRefs }) {
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
        </>
      )}
      {onFind && (
        <Rise k={6}>
          <FindCard onOpen={onFind} />
        </Rise>
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
  budsFill: { flex: 1, alignItems: "center" },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  fill: { flex: 1 },
  spread: { justifyContent: "space-between" },
  bud: { flex: 1, alignItems: "center" },
  ph: { width: "100%", alignItems: "center", justifyContent: "flex-end", marginBottom: 8 },
  photo: { width: "100%" },
  // a soft oval under the photo, as if it stood on the card (a spread shadow: blur filters aren't on every Android)
  shadow: { position: "absolute", bottom: 0, height: 6, borderRadius: 999 }, // as wide as the photo stands, not its column
  waitMsg: { gap: 12, paddingTop: 4 },
  swap: { height: 44, justifyContent: "center" },
  swapRow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  swapLabel: { width: 64 },
  glyph: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  gameChip: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: "center", marginTop: 4 },
});
