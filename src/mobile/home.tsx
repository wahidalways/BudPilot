// The earbuds at a glance: the phone's Home tab, and the earbuds pane beside the pages on a tablet.
import { type ComponentProps, type ComponentRef, type ReactNode, type RefObject, use, useEffect, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, LayoutAnimationConfig, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { usingSample } from "@/ble/connect";
import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { ancOn } from "@/hooks/use-earbuds";
import { ANC_LEVELS } from "@/hooks/use-adaptive-anc";
import type { Battery } from "@/jieli/earbuds";
import { gameEqChoices, keepChipParts, STRENGTHS, useJustCorrected } from "@/screens/home/shared";
import { type BudPilot, modeName } from "@/screens/home/use-bud-pilot";
import { useEqEditor } from "@/screens/home/use-eq-editor";
import { F, useColors, useTheme } from "@/theme";
import { GAME_EQ_NAME } from "@/utils/game";

import { loadPref, savePref } from "@/utils/prefs";

import Ionicons from "@expo/vector-icons/Ionicons";

import { brandOf, PHOTOS } from "./art";
import { BatteryLevel, useAppActive } from "./battery";
import { FindCard, Ring } from "./find";
import { NoiseGlyph } from "./icons";
import { Button, Card, CardHead, Chip, Link, Pill, Press, Rise, ScrollRow, Seg, Switch, T, tick, ToggleRow, Txt } from "./kit";
import { type Anchor, measureAnchor, MenuRow, Popover } from "./sheet";
import { PageActive, useSurface } from "./glass";

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
 * big the photos are (a tablet's earbuds tile shows them larger); `fill`: the card fills its tile, the earbuds centred.
 * `holding`: the earbuds just went, and the batteries stay a moment while the cards under it fade out (HomeCards). */
export function DeviceCard({ b, photos = 1, fill, holding }: { b: BudPilot; photos?: number; fill?: boolean; holding?: boolean }) {
  const c = useColors();
  const live = b.status === "connected" && !!b.state;
  const buds = live || (!!holding && !!b.state);
  const bat = b.state?.battery;
  const { logo, model } = brandOf(b.state?.name ?? "");
  // looking: connecting, or waiting while their sound is on this phone (or can't be told); otherwise they're in the case
  // or playing elsewhere, and Shono just waits
  const looking = b.status === "connecting" || (b.status === "reconnecting" && b.pcLinked !== false);
  const status = live ? (b.busy ? "Sending…" : "Connected") : b.status === "connecting" ? "Connecting…" : looking ? "Looking…" : b.status === "reconnecting" ? "Waiting" : "Not connected";
  return (
    <Card style={fill && s.fill}>
      {/* the name, and the connection as a small pill at the right (no light on this card: the user) */}
      <View style={s.deviceHead}>
        <View style={[s.inline, s.shrink]}>
          {live && logo && <Image source={logo.src} accessibilityLabel="hoco" resizeMode="contain" style={{ height: 13, width: 13 * logo.aspect, tintColor: c.ink, marginRight: 2 }} />}
          <Txt v="name" numberOfLines={1} style={s.shrink}>
            {live ? model || b.state!.name : "Your earbuds"}
          </Txt>
        </View>
        <View style={[s.statusPill, { backgroundColor: c.well }]}>
          {/* a still dot, also while connecting: a spinner kept the blur over it redrawing for the whole try (up to ~24 s) */}
          <View style={[s.dot, { backgroundColor: live ? c.ok : c.ink2 }]} />
          <Txt v="small" numberOfLines={1} style={{ color: live ? c.ok : c.ink2 }}>
            {status}
          </Txt>
        </View>
      </View>
      {buds ? (
        <View style={[s.buds, fill && s.budsFill]}>
          <Bud label="Left" level={bat?.left ?? null} photo={PHOTOS.left} live order={0} k={photos} />
          <Bud label="Case" level={bat?.case ?? null} photo={PHOTOS.case} live tall order={1} k={photos} />
          <Bud label="Right" level={bat?.right ?? null} photo={PHOTOS.right} live order={2} k={photos} />
        </View>
      ) : (
        // fades in where the batteries were, rather than replacing them in one frame
        <Animated.View entering={FadeIn.duration(220)} style={fill && s.budsFill}>
          <Radar looking={looking} k={photos} />
        </Animated.View>
      )}
      {!buds && (
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

/** The earbuds card while they aren't connected (the user's pick, "C · Radar"): the case, still, with rings spreading
 * from behind it while Shono looks for them: four spreads (~10 s), then still, since a look can last for hours with
 * the earbuds away. They play again when Home is shown again or Shono comes back to the front. */
function Radar({ looking, k = 1 }: { looking: boolean; k?: number }) {
  const c = useColors();
  const page = use(PageActive);
  const app = useAppActive();
  const on = looking && page && app;
  return (
    <View style={[s.radar, { height: 136 * k }]}>
      {[0, 800, 1600].map((delay) => (
        <Ring key={delay} on={on} delay={delay} color={c.signal} size={76 * k} reach={1.6} ms={2400} times={4} />
      ))}
      <Image source={PHOTOS.case} resizeMode="contain" style={{ width: 92 * k, height: 92 * k, opacity: looking ? 1 : 0.55 }} />
    </View>
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
      {/* the rows fade into each other, but not when the whole card goes (the earbuds disconnecting): Reanimated keeps
          a removed card on screen while a row inside it fades, so the card hung over what had moved into its place */}
      <LayoutAnimationConfig skipExiting>
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
      </LayoutAnimationConfig>
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

const EQ_TAGS = { game: "Game mode", preset: "Preset", mine: "Saved", custom: "Not saved" };
/** What the EQ plays, by name, and what kind of thing that is ("Movies", "Saved"). */
export function eqTitle(b: BudPilot, e: ReturnType<typeof useEqEditor>) {
  const name = e.kind === "game" ? GAME_EQ_NAME : e.kind === "preset" ? (P.eqPresets.find((p) => p.mode === b.state?.eqMode)?.name ?? "Preset") : (e.playing?.name ?? "Custom");
  return { name, tag: EQ_TAGS[e.kind] };
}

/** The EQ while gaming, as chips: Off, Game EQ, the presets and your EQs (Home and the Game page). */
export function GameEqChips({ b }: { b: BudPilot }) {
  const g = b.game;
  return (
    <ScrollRow label="EQ while gaming">
      <Pill label="Off" on={!g.prefs.eqOn} onPress={() => g.setEqOn(false)} />
      {gameEqChoices(b).map((ch) => (
        <Pill
          key={ch.key}
          label={ch.label}
          on={g.prefs.eqOn && ch.on}
          onPress={() => {
            if (!g.prefs.eqOn) g.setEqOn(true);
            ch.onPress();
          }}
        />
      ))}
    </ScrollRow>
  );
}

/** A round icon well; `lit`: filled with the accent. */
function Well({ icon, lit, size = 40 }: { icon: ComponentProps<typeof Ionicons>["name"]; lit: boolean; size?: number }) {
  const c = useColors();
  return (
    <View style={[s.well, { width: size, height: size, borderRadius: size / 2, backgroundColor: lit ? c.signalFill : c.well }]}>
      <Ionicons name={lit ? icon : (`${icon}-outline` as typeof icon)} size={Math.round(size * 0.5)} color={lit ? c.onSignal : c.ink2} />
    </View>
  );
}

type TileRef = RefObject<ComponentRef<typeof View> | null>;

/** EQ while gaming, from Home's Game mode tile: a chip with what plays while gaming; a tap drops a small menu down from
 * it (Off, Game EQ, the presets and your EQs; the one playing ticked), and picking one closes it. A menu at the chip, not
 * a sheet from the bottom: less to draw and to move, and the choice stays next to where it was asked (the menu draws
 * nothing while it's closed). */
function GameEqPick({ b }: { b: BudPilot }) {
  const c = useColors();
  const [at, setAt] = useState<Anchor>();
  const g = b.game;
  const label = g.prefs.eqOn ? g.gameEqName : "No game EQ";
  const pick = (run: () => void) => {
    tick();
    run();
    setAt(undefined);
  };
  return (
    <>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`EQ while gaming: ${label}. Change`}
        onPress={(ev) => void measureAnchor(ev.currentTarget, setAt)}
        scale={0.95}
        style={[s.tileChip, { backgroundColor: c.well }]}
      >
        <Ionicons name="options-outline" size={14} color={c.ink2} />
        <Text numberOfLines={1} style={[T.small, s.chipText, { color: c.ink }]}>
          {label}
        </Text>
        <Ionicons name={at ? "chevron-up" : "chevron-down"} size={14} color={c.ink2} />
      </Press>
      <Popover anchor={at} label="EQ while gaming" width={220} onClose={() => setAt(undefined)}>
        <ScrollView style={s.dropList} bounces={false}>
            <Txt v="small" muted style={s.dropHead}>
              EQ while gaming
            </Txt>
            <MenuRow label="Off" on={!g.prefs.eqOn} onPress={() => pick(() => g.setEqOn(false))} />
            {gameEqChoices(b).map((ch) => (
              <MenuRow
                key={ch.key}
                label={ch.label}
                on={g.prefs.eqOn && ch.on}
                onPress={() =>
                  pick(() => {
                    if (!g.prefs.eqOn) g.setEqOn(true);
                    ch.onPress();
                  })
                }
              />
            ))}
        </ScrollView>
      </Popover>
    </>
  );
}

const STREAKS = [46, 28, 60, 20, 38]; // the speed streaks' lengths, top to bottom: kept to the corner, clear of the words
const STREAK_ALPHA = [0.55, 0.35, 0.8, 0.3, 0.5];

/** Game mode's look of speed: slanted streaks in the tile's corner, faint while it's off. Switching it on sends them
 * through in one quick whoosh, then they rest, brighter and in the accent, over a soft glow. Transform and opacity only,
 * once per switch: nothing loops, so a still screen stays still. */
function SpeedStreaks({ on }: { on: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const p = useSharedValue(on ? 1 : 0);
  const first = useRef(true); // no whoosh when the tile first appears, only when Game mode is switched
  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      return void p.set(on ? 1 : 0);
    }
    if (on) {
      p.set(0);
      p.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    } else p.set(withTiming(0, { duration: 220 }));
  }, [on, reduce, p]);
  const a = useAnimatedStyle(() => ({ opacity: 0.3 + p.get() * 0.7, transform: [{ translateX: (1 - p.get()) * -34 }, { rotate: "-24deg" }] }));
  return (
    <>
      {on && <View pointerEvents="none" style={[s.gameGlow, { backgroundImage: `radial-gradient(circle closest-side, ${c.tint} 0%, rgba(0,0,0,0) 100%)` }]} />}
      <Animated.View pointerEvents="none" style={[s.streaks, a]}>
        {STREAKS.map((w, i) => (
          <View key={i} style={[s.streak, { width: w, opacity: STREAK_ALPHA[i], backgroundColor: on ? c.signal : c.ink2 }]} />
        ))}
      </Animated.View>
    </>
  );
}

/** The Equalizer and Game mode side by side (the user's pick of four designs), built alike: what it is and what's on at
 * the top, one chip in the middle (the EQ's kind; the EQ while gaming, to change it), the icon and control at the foot.
 * A tap on a tile opens its page; the EQs themselves are picked there (the user: no row of them on Home). `eqRef`,
 * `gameRef`: for the tour's spotlight. */
function EqGameTiles({ b, onEdit, onGame, eqRef, gameRef }: { b: BudPilot; onEdit: () => void; onGame?: () => void; eqRef?: TileRef; gameRef?: TileRef }) {
  const c = useColors();
  const f = useSurface();
  const e = useEqEditor(b);
  const { name, tag } = eqTitle(b, e);
  const g = b.game;
  return (
    <View style={s.tileRow}>
      <View ref={eqRef} collapsable={false} style={s.grow}>
        <Press accessibilityRole="button" accessibilityLabel={`Equalizer: ${name}, ${tag}. Open`} onPress={onEdit} scale={0.97} style={[s.tile, { backgroundColor: f.bg, borderColor: f.edge }]}>
          <View>
            <Txt v="small" muted>
              Equalizer
            </Txt>
            <Text numberOfLines={1} style={[s.tileValue, { color: c.ink }]}>
              {name}
            </Text>
          </View>
          <View style={s.chipWrap}>
            <Chip quiet={e.kind !== "mine"}>{tag}</Chip>
          </View>
          <View style={s.tileFoot}>
            <Well icon="options" lit />
            <View style={[s.go, { backgroundColor: c.well }]}>
              <Ionicons name="chevron-forward" size={16} color={c.ink} />
            </View>
          </View>
        </Press>
      </View>
      <View ref={gameRef} collapsable={false} style={s.grow}>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`Game mode ${g.active ? "on, low delay" : "off"}. Open`}
          disabled={!onGame}
          onPress={onGame}
          scale={0.97}
          style={[s.tile, s.clip, g.active ? { backgroundColor: c.tint, borderColor: c.tintEdge } : { backgroundColor: f.bg, borderColor: f.edge }]}
        >
          <SpeedStreaks on={g.active} />
          <View>
            <Txt v="small" muted>
              Game mode
            </Txt>
            <View style={s.valueRow}>
              {g.active && <Ionicons name="flash" size={16} color={c.signalInk} />}
              <Text numberOfLines={1} style={[s.tileValue, { color: g.active ? c.signalInk : c.ink }]}>
                {g.active ? "Low delay" : "Off"}
              </Text>
            </View>
          </View>
          <GameEqPick b={b} />
          <View style={s.tileFoot}>
            <Well icon="game-controller" lit={g.active} />
            <Switch value={g.active} onChange={g.setOn} label="Game mode" />
          </View>
        </Press>
      </View>
    </View>
  );
}

const LEAVE_MS = 180; // after the earbuds go, the controls fade this long in place before they make room

/** `live`, held a moment after it ends (`leaving`), so the cards that need the earbuds can fade out in place. Removed
 * at once, they took everything under them up in one frame, and the earbuds card changed at the same moment (the
 * user, 2026-11-25: "the animation of going out stutters and broken"). Back on, they show at once. */
export function useLeaving(live: boolean) {
  const reduce = useReducedMotion();
  const [kept, setKept] = useState(live);
  if (live && !kept) setKept(true);
  useEffect(() => {
    if (live) return;
    const t = setTimeout(() => setKept(false), reduce ? 0 : LEAVE_MS);
    return () => clearTimeout(t);
  }, [live, reduce]);
  return { shown: live || kept, leaving: !live && kept };
}

/** Fades its children out, sinking a little, while `leaving` (on the UI thread; nothing moves around them). */
export function Leave({ leaving, children }: { leaving: boolean; children: ReactNode }) {
  const p = useSharedValue(1);
  useEffect(() => {
    p.set(leaving ? withTiming(0, { duration: LEAVE_MS - 20, easing: Easing.out(Easing.quad) }) : 1);
  }, [leaving, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: (1 - p.get()) * 8 }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

/** Where the tour finds Home's cards. */
export type TourRefs = Record<"stack" | "device" | "noise" | "eq" | "game" | "touch", RefObject<ComponentRef<typeof View> | null>>;

/** Home's cards, rising in one after another. `refs`: for the tour's spotlight. */
/** `onFind`: a phone's way into Find my earbuds (tablets have it in the rail). Shown connected or not: Last seen is
 * for when they're gone. */
export function HomeCards({ b, onEdit, onFind, onGame, compact, refs }: { b: BudPilot; onEdit: () => void; onFind?: () => void; onGame?: () => void; compact?: boolean; refs?: TourRefs }) {
  const { shown, leaving } = useLeaving(b.status === "connected" && !!b.state);
  return (
    <View style={s.stack} ref={refs?.stack} collapsable={false}>
      <Rise k={0}>
        <Welcome b={b} />
      </Rise>
      <Rise k={1}>
        <View ref={refs?.device} collapsable={false}>
          <DeviceCard b={b} holding={leaving} />
        </View>
      </Rise>
      {shown && b.state && (
        <Leave leaving={leaving}>
          <View style={s.stack}>
            <Rise k={2}>
              <View ref={refs?.noise} collapsable={false}>
                <NoiseCard b={b} compact={compact} />
              </View>
            </Rise>
            <Rise k={3}>
              <EqGameTiles b={b} onEdit={onEdit} onGame={onGame} eqRef={refs?.eq} gameRef={refs?.game} />
            </Rise>
          </View>
        </Leave>
      )}
      {onFind && (
        // fades with the others, then rises in its new place (a new key: Rise plays when it mounts)
        <Leave key={shown ? "with" : "alone"} leaving={leaving}>
          <Rise k={shown ? 6 : 2}>
            <FindCard onOpen={onFind} />
          </Rise>
        </Leave>
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
  chipsLabel: { marginBottom: -4 },
  well: { alignItems: "center", justifyContent: "center" },
  tileRow: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, minHeight: 168, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12, justifyContent: "space-between" },
  chipWrap: { alignSelf: "flex-start", maxWidth: "100%" },
  tileChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 14, alignSelf: "flex-start", maxWidth: "100%" },
  chipText: { flexShrink: 1, fontFamily: F.semibold },
  go: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  clip: { overflow: "hidden" },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  streaks: { position: "absolute", top: -10, right: -22, gap: 6, alignItems: "flex-end" },
  streak: { height: 3, borderRadius: 2 },
  gameGlow: { position: "absolute", top: -50, right: -50, width: 170, height: 170, borderRadius: 85 },
  dropList: { maxHeight: 340 },
  dropHead: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  tileFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileValue: { fontFamily: F.display, fontSize: 18, lineHeight: 23 },
  deviceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  shrink: { flexShrink: 1, minWidth: 0 },
  radar: { alignItems: "center", justifyContent: "center" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13, flexShrink: 0 },
});
