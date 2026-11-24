// The phone's tabs and the tablet's pages: Sound, Equalizer, Game, Touch controls, and App settings.
import { type ComponentProps, use, useEffect, useState } from "react";
import { AppState, Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, interpolate, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { G, Path } from "react-native-svg";

import { usingSample } from "@/ble/connect";
import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { ancOn } from "@/hooks/use-earbuds";
import { ANC_LEVELS } from "@/hooks/use-adaptive-anc";
import { EqCurve } from "@/screens/home/eq-curve";
import { CREDIT_NAME, MODE_SUBS, eqChoices } from "@/screens/home/parts";
import { fnName, gesture } from "@/screens/home/touch-controls";
import { type BudPilot, modeName } from "@/screens/home/use-bud-pilot";
import { useEqEditor } from "@/screens/home/use-eq-editor";
import { ACCENTS, F, hsl, useColors, useTheme } from "@/theme";
import { GitHubLogo, XLogo } from "@/ui/icons";
import { GAME_EQ, GAME_EQ_NAME } from "@/utils/game";
import { MAX_NAME } from "@/utils/my-eqs";

import appConfig from "../../app.json";
import { askBackgroundUnrestricted, backgroundUnrestricted, clearLog, keeperAvailable, readLog } from "../../modules/shono-keeper";

import Ionicons from "@expo/vector-icons/Ionicons";

import { EAR_OUTLINE, FnGlyph, NoiseGlyph } from "./icons";
import { BATTERY_STYLES } from "./battery";
import { PageActive, useGlass, useSurface } from "./glass";
import { eqTitle, GameEqChips, PHONE_STRENGTHS } from "./home";
import { LatencyCheck } from "./latency";
import { Button, Card, CardHead, Chip, Lockup, Pill, Pills, Press, Seg, Switch, T, tick, ToggleRow, Txt } from "./kit";
import { type Anchor, measureAnchor, MenuRow, Popover, Sheet } from "./sheet";

/** What pages need to know about where they are. */
export type Ui = { tablet: boolean };

/** What a page or tile says while the earbuds aren't connected. */
export const notConnectedText = (b: BudPilot) => ({
  title: b.status === "reconnecting" ? "Waiting for your earbuds" : b.status === "connecting" ? "Connecting…" : "Not connected",
  line:
    b.status === "idle"
      ? "Connect your earbuds to change this."
      : b.pcLinked === false
        ? "Shono connects when your earbuds play on this phone."
        : "Open the case. Shono connects by itself.",
});

/** Shown on a page that needs the earbuds while they aren't connected. */
export function NotConnected({ b }: { b: BudPilot }) {
  const { title, line } = notConnectedText(b);
  return (
    <Card>
      <Txt v="strong">{title}</Txt>
      <Txt v="sub">{line}</Txt>
      {b.status === "idle" && <Button label="Connect" kind="pri" onPress={() => void b.connect()} />}
    </Card>
  );
}

// ───────── Sound ─────────

/** What each noise mode does to the room: sound waves come in from the left; ANC stops them at a wall (thicker with
 * strength), Transparency lets them reach your ear, Off leaves them faint. */
function Field({ mode, level }: { mode: number; level: number }) {
  const c = useColors();
  const surface = useSurface();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const shown = use(PageActive); // the waves rest while their page is out of sight
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(0);
    if (!reduce && shown) t.set(withRepeat(withTiming(1, { duration: mode === 0 ? 3200 : 2400, easing: Easing.linear }), -1));
  }, [mode, reduce, shown, t]);
  const wall = [2.5, 5, 8][level] ?? 5;
  const scale = Math.min(1, (width - 64) / 360);
  return (
    <View style={[s.field, { backgroundColor: surface.bg, borderColor: surface.edge, boxShadow: surface.shine }]} aria-hidden>
      <View style={{ width: 360, height: 150, transform: [{ scale }] }}>
        {/* a soft glow of the accent around the ear: strongest with ANC, softer with Transparency, none when off */}
        <View pointerEvents="none" style={[s.glow, { opacity: [0, 1, 0.6][mode] ?? 0, backgroundImage: `radial-gradient(circle closest-side, ${c.tint} 0%, ${c.tint} 35%, rgba(0,0,0,0) 100%)` }]} />
        {[0, 1, 2].map((k) => (
          <Wave key={k} t={t} phase={k / 3} mode={mode} reduce={reduce} color={c.signal} />
        ))}
        <Svg width={360} height={150} style={StyleSheet.absoluteFill}>
          {mode === 1 && <Path d="M196 38a52 52 0 0 1 0 74" stroke={c.signalInk} strokeWidth={wall} strokeLinecap="round" fill="none" />}
          <G transform="translate(213 35) scale(0.156)">
            {EAR_OUTLINE.map((d) => (
              <Path key={d} d={d} stroke={c.ink} strokeWidth={15} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </G>
        </Svg>
      </View>
      <View style={s.fieldCap}>
        <Text style={[s.fieldMode, { color: c.ink }]}>{modeName(mode)}</Text>
        <Text style={[T.small, { color: c.ink2 }]}>
          {mode === 1 ? `${P.ancLevels[level]?.name ?? ""} · ` : ""}
          {MODE_SUBS[mode]}
        </Text>
      </View>
    </View>
  );
}

/** One wave: an arc that travels right and fades (stopped at the wall for ANC). */
function Wave({ t, phase, mode, reduce, color }: { t: { get(): number }; phase: number; mode: number; reduce: boolean; color: string }) {
  const end = mode === 1 ? 14 : mode === 2 ? 56 : -26;
  const a = useAnimatedStyle(() => {
    const p = reduce ? 0.4 + phase / 2 : (t.get() + phase) % 1;
    if (mode === 0) return { opacity: 0.12 + 0.1 * Math.sin(p * Math.PI * 2) ** 2, transform: [{ translateX: -30 + p * 4 }] };
    const x = interpolate(p, [0, mode === 1 ? 0.58 : 1], [-70, end], "clamp");
    const fade = mode === 1 ? interpolate(p, [0, 0.15, 0.45, 0.58], [0, 0.85, 0.6, 0], "clamp") : interpolate(p, [0, 0.15, 0.8, 1], [0, 0.85, 0.5, 0], "clamp");
    return { opacity: fade, transform: [{ translateX: x }] };
  });
  return (
    <Animated.View style={[s.wave, a]}>
      <Svg width={18} height={64}>
        <Path d="M2 2a40 40 0 0 1 0 60" stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

/** A big noise-mode tile; the chosen one is tinted and its tick springs in. */
function ModeTile({ mode, on, onPress }: { mode: number; on: boolean; onPress: () => void }) {
  const c = useColors();
  const surface = useSurface();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => p.set(withSpring(on ? 1 : 0, { dampingRatio: 0.55, duration: 320 })), [on, p]);
  const tickStyle = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scale: p.get() }] }));
  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${modeName(mode)}, ${MODE_SUBS[mode]}`}
      onPress={() => {
        if (on) return;
        tick();
        onPress();
      }}
      style={[s.tile, { backgroundColor: on ? c.tint : surface.bg, borderColor: on ? c.tintEdge : surface.edge }]}
    >
      <Animated.View style={[s.tick, { backgroundColor: c.signalFill }, tickStyle]}>
        <Ionicons name="checkmark" size={13} color={c.onSignal} />
      </Animated.View>
      <NoiseGlyph mode={mode} on={on} color={on ? c.signalInk : c.ink} size={30} />
      <Txt v="strong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: F.semibold, fontSize: 13, letterSpacing: -0.1 }}>
        {modeName(mode)}
      </Txt>
      <Txt v="sub" style={{ fontSize: 12 }}>
        {MODE_SUBS[mode]}
      </Txt>
    </Press>
  );
}

export function SoundPage({ b }: { b: BudPilot }) {
  if (b.status !== "connected" || !b.state) return <NotConnected b={b} />;
  const state = b.state;
  const ncLevel = b.noisePref?.ncLevel ?? ANC_LEVELS[b.adaptive.current];
  const modes = [0, 1, 2].filter((m) => state.ancGains[m]);
  return (
    <View style={s.stack}>
      <Field mode={state.anc} level={b.adaptive.current} />
      <View style={s.tiles}>
        {modes.map((m) => (
          <ModeTile key={m} mode={m} on={state.anc === m} onPress={() => void b.setNoise(m === 1 ? ancOn() : { mode: m, ncLevel, adaptive: false })} />
        ))}
      </View>
      {/* only with ANC (the user's choice); it fades in and out, and the card under it glides to its place */}
      {state.anc === 1 && (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
          <Card>
            <CardHead title="ANC strength" />
            <Seg
              label="ANC strength"
              options={PHONE_STRENGTHS}
              value={String(b.adaptive.current)}
              onChange={(v) => void b.setNoise({ mode: 1, ncLevel: ANC_LEVELS[Number(v)], adaptive: false })}
            />
          </Card>
        </Animated.View>
      )}
      <Animated.View layout={LinearTransition.duration(220)}>
        <KeepCard b={b} />
      </Animated.View>
    </View>
  );
}

/** Keep my noise setting and its note: the Sound page's last card, and one of a tablet Dashboard's. */
export function KeepCard({ b }: { b: BudPilot }) {
  return (
    <Card>
      <ToggleRow
        first
        icon="shield-checkmark-outline"
        title="Keep my noise setting"
        detail="Undoes the earbuds' own switches, even when Shono is in the background (it shows a small notification). Press and hold still works."
        value={b.keep}
        onChange={b.setKeep}
      />
      <ToggleRow icon="notifications-outline" title="Tell me when Shono steps in" detail="When it puts your noise setting back" value={b.notice.on} onChange={b.notice.setOn} />
    </Card>
  );
}

// ───────── Equalizer ─────────

const EQ_LEDE = {
  game: "Gaming EQ plays while Game mode is on.",
  preset: "Preset playing. Drag a point to make your own.",
  mine: "Your own curve, kept on the earbuds",
  custom: "A curve that isn't saved yet",
};

/** Naming a new EQ or renaming one: the box, what's wrong with the name, Cancel and Save (always pressable). */
function NameForm({ e }: { e: ReturnType<typeof useEqEditor> }) {
  const c = useColors();
  const naming = e.naming;
  if (!naming) return null;
  return (
    <View style={s.form}>
      <TextInput
        value={naming.name}
        onChangeText={(name) => e.setNaming({ ...naming, name, problem: undefined })}
        maxLength={MAX_NAME}
        autoFocus
        selectTextOnFocus
        placeholder="Name it, e.g. Movies"
        placeholderTextColor={c.ink2}
        accessibilityLabel={naming.id ? "New name" : "Name for the new EQ"}
        onSubmitEditing={e.confirmName}
        style={[s.input, T.body, { color: c.ink, backgroundColor: c.well }]}
      />
      <Txt v="sub" style={{ color: c.danger, minHeight: 18 }}>
        {naming.problem ?? ""}
      </Txt>
      <View style={s.btns}>
        <Button label="Cancel" style={s.grow} onPress={() => e.setNaming(undefined)} />
        <Button label="Save" kind="pri" style={s.grow} onPress={e.confirmName} />
      </View>
    </View>
  );
}

/** The EQ page; `one`: all of it in one card (a tablet's Dashboard, where it sits among other cards); `fill`: that
 * card fills the height it's given, the curve taking the room. */
export function EqPage({ b, ui, one, fill }: { b: BudPilot; ui: Ui; one?: boolean; fill?: boolean }) {
  if (b.status !== "connected" || !b.state) return <NotConnected b={b} />;
  return <Eq b={b} ui={ui} one={one} fill={fill} />;
}

function Eq({ b, ui, one, fill }: { b: BudPilot; ui: Ui; one?: boolean; fill?: boolean }) {
  const c = useColors();
  const e = useEqEditor(b);
  const my = b.myEqs;
  const [deleting, setDeleting] = useState<{ id: string; name: string }>();
  const [menu, setMenu] = useState<Anchor>(); // the one-card form's ⋯ menu, beside its button
  const [room, setRoom] = useState(230); // `fill`: the curve's height, as much as the card has
  const { name, tag } = eqTitle(b, e);
  // the band the stepper adjusts: the last point touched, on this EQ (picking another EQ puts the hint back)
  const [pick, setPick] = useState<{ band: number; on: string }>();
  const band = pick?.on === name && e.kind !== "game" ? pick.band : undefined;
  const nudge = (d: number) => {
    if (band === undefined) return;
    const v = Math.max(-P.eqMax, Math.min(P.eqMax, e.gains[band] + d));
    if (v === e.gains[band]) return;
    tick();
    e.commit(e.gains.map((g, i) => (i === band ? v : g))); // like a drag: a preset becomes your own Custom curve
  };
  const sheets = (
    <>
      <Sheet
        open={!!e.naming}
        tablet={ui.tablet}
        title={e.naming?.id ? "Rename" : "Save EQ"}
        sub={e.naming?.id ? "New name" : e.kind === "preset" ? "Starts from this preset's shape. Drag the points to make it yours." : "Saves a copy of what's playing now."}
        onClose={() => e.setNaming(undefined)}
      >
        <NameForm e={e} />
      </Sheet>
      <Sheet
        open={!!deleting}
        tablet={ui.tablet}
        title={`Delete “${deleting?.name ?? ""}”?`}
        sub="The earbuds keep playing this curve as Custom until you pick another."
        onClose={() => setDeleting(undefined)}
      >
        <View style={s.btns}>
          <Button label="Cancel" style={s.grow} onPress={() => setDeleting(undefined)} />
          <Button
            label="Delete"
            kind="danger"
            style={s.grow}
            onPress={() => {
              if (deleting) my.remove(deleting.id);
              setDeleting(undefined);
            }}
          />
        </View>
      </Sheet>
    </>
  );
  const curve = (
        <EqCurve
          bands={P.eqBands}
          gains={e.kind === "game" ? GAME_EQ : e.gains}
          max={P.eqMax}
          faded={e.kind !== "game" && e.faded}
          readOnly={e.kind === "game"}
          onCommit={e.commit}
          onStep={tick}
          onPick={(i) => setPick({ band: i, on: name })}
          height={one ? room : ui.tablet ? 320 : 264} // taller than it was (220): more room per dB for a finger
        />
  );
  const note =
    band !== undefined ? (
      <BandStepper band={band} gain={e.gains[band]} onStep={nudge} />
    ) : (
        <View style={s.note}>
          <Ionicons name="information-circle-outline" size={16} color={c.ink2} />
          <Txt v="sub" style={s.grow}>
            {e.kind === "game"
              ? "Your EQ comes back when Game mode turns off."
              : e.kind === "preset"
                ? "The preset's shape. Drag a point to make your own from it."
                : e.kind === "mine"
                  ? `Changes save into “${e.playing!.name}” as you drag.`
                  : "Drag a point. Save it to keep it."}
          </Txt>
        </View>
    );
  const pills = (
        <Pills>
          {eqChoices(b).map((ch) => (
            <Pill key={ch.key} label={ch.label} on={ch.on} onPress={ch.onPress} />
          ))}
          <Pill add label="New" on={false} onPress={e.startNew} />
        </Pills>
  );
  // what can be done with what plays: save an unsaved curve; rename, flatten or delete one of yours; leave Game EQ
  const canFlat = (e.kind === "custom" || e.kind === "mine") && !e.isFlat;
  // they sit in a strip of fixed height, so the card keeps its size as you switch EQs (the user: Rename and Delete
  // appearing "resized the card"); a preset has none (Save as… only for an unsaved curve, the user didn't want it
  // showing all the time). Reset to flat dims, rather than going, while the curve is flat
  const all: EqAction[] = [];
  if (e.kind === "custom") all.push({ label: "Save", icon: "bookmark-outline", primary: true, run: () => e.setNaming({ name: "" }) });
  if (e.kind === "mine") all.push({ label: "Rename", icon: "create-outline", iconOnly: true, run: () => e.setNaming({ id: e.playing!.id, name: e.playing!.name }) });
  if (e.kind === "custom" || e.kind === "mine") all.push({ label: "Reset to flat", icon: "refresh-outline", off: !canFlat, run: e.resetToFlat });
  if (e.kind === "mine") all.push({ label: "Delete", icon: "trash-outline", danger: true, iconOnly: true, run: () => setDeleting({ id: e.playing!.id, name: e.playing!.name }) });
  if (e.kind === "game") all.push({ label: `Turn off ${GAME_EQ_NAME}`, icon: "power-outline", run: () => b.game.setEqOn(false) });
  if (one) {
    const actions = all.filter((a) => !a.primary && !a.off); // Save sits in the card's heading; the rest in its ⋯ menu
    return (
      <Card style={fill && s.grow}>
        {sheets}
        <CardHead
          title={`Equalizer · ${name}`}
          right={
            <View style={s.inline}>
              <Txt v="sub">{tag}</Txt>
              {e.kind === "custom" && (
                <Press accessibilityRole="button" accessibilityLabel="Save as" onPress={() => e.setNaming({ name: "" })} style={[s.small, { backgroundColor: c.signalFill }]}>
                  <Text style={[T.small, { color: c.onSignal, fontFamily: F.semibold }]}>Save</Text>
                </Press>
              )}
              {actions.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More EQ actions"
                  hitSlop={8}
                  onPress={(ev) => void measureAnchor(ev.currentTarget, setMenu)}
                  style={({ pressed }) => [s.dots, { backgroundColor: pressed ? c.hair : c.well }]}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={c.ink} />
                </Pressable>
              )}
            </View>
          }
        />
        {fill ? (
          // the curve takes what the card has beyond its other parts (at least its usual height). It lies over that
          // space rather than filling it, so it never holds the column taller than the others need
          <View style={s.curveRoom} onLayout={(ev) => setRoom(Math.max(230, Math.floor(ev.nativeEvent.layout.height)))}>
            <View style={StyleSheet.absoluteFill}>{curve}</View>
          </View>
        ) : (
          curve
        )}
        {note}
        <View style={[s.rule, { backgroundColor: c.hair }]} />
        {pills}
        <Popover anchor={menu} label="EQ actions" width={230} onClose={() => setMenu(undefined)}>
          {actions.map((a) => (
            <MenuRow
              key={a.label}
              label={a.label}
              danger={a.danger}
              icon={<Ionicons name={a.icon} size={19} color={a.danger ? c.danger : c.ink} />}
              onPress={() => {
                setMenu(undefined);
                a.run();
              }}
            />
          ))}
        </Popover>
      </Card>
    );
  }
  return (
    <View style={s.stack}>
      {sheets}
      <Txt v="sub" style={s.lede}>
        {EQ_LEDE[e.kind]}
      </Txt>
      <Card>
        <CardHead title={name} right={<Chip quiet={e.kind !== "mine"}>{tag}</Chip>} />
        {curve}
        {note}
        <EqActions actions={all} k={e.kind} />
      </Card>
      <Card>
        <CardHead title="Sound" />
        {pills}
      </Card>
    </View>
  );
}

const hz = (label: string) => (label.endsWith("K") ? `${label.slice(0, -1)} kHz` : `${label} Hz`);
const dbText = (g: number) => `${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.abs(g)} dB`; // a real minus sign

/** Fine-tuning for the point last touched, in the hint's place under the chart: one dB a tap, for when a finger is too
 * coarse for one step. */
function BandStepper({ band, gain, onStep }: { band: number; gain: number; onStep: (d: number) => void }) {
  const c = useColors();
  const step = (d: number, icon: "remove" | "add", label: string) => {
    const off = d < 0 ? gain <= -P.eqMax : gain >= P.eqMax;
    return (
      <Press
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: off }}
        disabled={off}
        hitSlop={6}
        scale={0.88}
        onPress={() => onStep(d)}
        style={[s.stepBtn, { backgroundColor: c.well }, off && s.actOff]}
      >
        <Ionicons name={icon} size={20} color={c.ink} />
      </Press>
    );
  };
  return (
    <View style={s.stepper} accessibilityLabel={`${hz(P.eqBands[band])}, ${dbText(gain)}`}>
      {step(-1, "remove", `Lower ${hz(P.eqBands[band])}`)}
      <View style={s.stepMid}>
        <Txt v="small" muted>
          {hz(P.eqBands[band])}
        </Txt>
        <Text style={[T.strong, { fontFamily: F.semibold, fontSize: 16, lineHeight: 20, color: gain ? c.signalInk : c.ink }]}>{dbText(gain)}</Text>
      </View>
      {step(1, "add", `Raise ${hz(P.eqBands[band])}`)}
    </View>
  );
}

// iconOnly: Rename and Delete beside Reset to flat (three labels don't fit a phone's width; "Reset to flat" was cut short)
type EqAction = { label: string; icon: ComponentProps<typeof Ionicons>["name"]; primary?: boolean; danger?: boolean; off?: boolean; iconOnly?: boolean; run: () => void };

/** What can be done with the curve, under it in its card: side-by-side buttons, an icon beside each label. Save is the
 * accent; Delete reads red without shouting. They used to be full-width buttons at the foot of the page, away from the
 * curve they act on. The strip keeps its height when there are none (a preset), and a new set fades in over the old
 * one (`k`: what plays), so nothing below moves. */
function EqActions({ actions, k }: { actions: EqAction[]; k: string }) {
  const c = useColors();
  return (
    <View style={s.actSlot}>
      {actions.length > 0 && (
    <Animated.View key={k} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={[StyleSheet.absoluteFill, s.acts]}>
      {actions.map((a) => {
        const ink = a.primary ? c.signalInk : a.danger ? c.danger : c.ink;
        return (
          <Press
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityState={{ disabled: !!a.off }}
            disabled={a.off}
            onPress={a.run}
            // Save: the accent's tint, like a chosen pill (a solid block outweighed everything else in the card)
            style={[s.act, a.iconOnly ? s.actIcon : s.actGrow, a.primary ? { backgroundColor: c.tint, borderColor: c.tintEdge, borderWidth: 1 } : { backgroundColor: c.well }, a.off && s.actOff]}
          >
            <Ionicons name={a.icon} size={a.iconOnly ? 20 : 18} color={ink} />
            {!a.iconOnly && (
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={[T.strong, { fontSize: 14, fontFamily: F.semibold, color: ink, flexShrink: 1 }]}>
              {a.label}
            </Text>
            )}
          </Press>
        );
      })}
    </Animated.View>
      )}
    </View>
  );
}

// ───────── Game ─────────

/** The bolt beside "Low delay on": pulses three times when Game mode comes on, then stays lit. */
export function Turbo({ on }: { on: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const p = useSharedValue(1);
  useEffect(() => {
    if (on && !reduce) p.set(withRepeat(withSequence(withTiming(1.5, { duration: 260 }), withTiming(1, { duration: 260 })), 3));
  }, [on, reduce, p]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: p.get() }], opacity: 2 - p.get() }));
  return (
    <View style={[s.turbo, { backgroundColor: on ? c.signalFill : c.well }]}>
      <Animated.View style={a}>
        <Ionicons name={on ? "flash" : "flash-outline"} size={13} color={on ? c.onSignal : c.ink2} />
      </Animated.View>
      <Text style={[T.small, { fontFamily: F.semibold, color: on ? c.onSignal : c.ink2 }]}>{on ? "Low delay on" : "Normal delay"}</Text>
    </View>
  );
}

/** Game mode's switch, and the delay chip under its name (the card around it lights while it's on). */
function GameHead({ b }: { b: BudPilot }) {
  const c = useColors();
  const g = b.game;
  return (
    <View style={s.row}>
      <View style={[s.glyphBig, { backgroundColor: g.active ? c.signalFill : c.well }]}>
        <Ionicons name={g.active ? "game-controller" : "game-controller-outline"} size={28} color={g.active ? c.onSignal : c.ink2} />
      </View>
      <View style={[s.grow, s.gameName]}>
        <Txt v="name" style={{ fontSize: 18 }}>
          Game mode
        </Txt>
        <Turbo on={g.active} />
      </View>
      <Switch value={g.active} onChange={g.setOn} label="Game mode" />
    </View>
  );
}

/** EQ while gaming as one row of chips you tap (a tablet's Game card): Off, Game EQ, the presets and your EQs, scrolling
 * sideways; the row keeps its height whatever is chosen. */
export function GameEqPicker({ b, first }: { b: BudPilot; first?: boolean }) {
  const c = useColors();
  return (
    <View style={first ? undefined : [s.chipsHead, { borderTopColor: c.hair }]}>
      <Txt v="strong">EQ while gaming</Txt>
      <Txt v="sub">Plays while Game mode is on. Your own EQ comes back after.</Txt>
      <View style={s.chipsGap} />
      <GameEqChips b={b} />
    </View>
  );
}

/** Turn on with games, and Usage access when it needs it (Android, where Shono can see the app in front). */
export function AutoGamesRow({ b, first }: { b: BudPilot; first?: boolean }) {
  const g = b.game;
  if (!keeperAvailable()) return null;
  return (
    <>
      <ToggleRow
        first={first}
        icon="sparkles-outline"
        title="Turn on with games"
        detail="Game mode comes on while a game is open, and goes off when you leave it."
        value={g.prefs.auto}
        onChange={(auto) => {
          g.update({ auto });
          if (auto && !g.usage) g.allowUsage();
        }}
      />
      {g.prefs.auto && !g.usage && (
        <View style={s.inline}>
          <Txt v="sub" style={s.grow}>
            Needs Usage access, so Shono can see when a game is open. It only looks at which app is in front.
          </Txt>
          <Button label="Allow" kind="out" onPress={() => void g.allowUsage()} />
        </View>
      )}
    </>
  );
}

export function GamePage({ b }: { b: BudPilot }) {
  const c = useColors();
  if (b.status !== "connected" || !b.state) return <NotConnected b={b} />;
  return (
    <View style={s.stack}>
      <Card style={b.game.active && { backgroundColor: c.tint, borderColor: c.tintEdge }}>
        <GameHead b={b} />
      </Card>
      <Card>
        {/* one steady row of choices, Off first: it used to be a switch that pushed a row of pills in and out */}
        <GameEqPicker b={b} first />
      </Card>
      {keeperAvailable() && (
        <Card>
          <AutoGamesRow b={b} first />
        </Card>
      )}
      <Card>
        <CardHead title="Latency check" />
        <LatencyCheck gameOn={b.game.active} />
      </Card>
    </View>
  );
}

// ───────── Touch controls ─────────

export const EARS = [
  { ear: 1, label: "Left" },
  { ear: 2, label: "Right" },
];

/** Choosing what a gesture does: the sheet of actions (`sheet`, placed with the gestures), `pick` to open it, and each
 * gesture's action. A choice on its way to the earbuds shows at once and is kept only once they confirm it (otherwise
 * the error shows). The Touch page and a tablet's touch tile both use it. */
export function useKeyPicker(b: BudPilot, tablet: boolean) {
  const c = useColors();
  const [saving, setSaving] = useState<{ ear: number; taps: number; fn: number }>();
  const [picking, setPicking] = useState<{ ear: number; taps: number }>(); // the gesture whose action is being chosen
  const [anchor, setAnchor] = useState<Anchor>(); // a tablet: where the tapped gesture is, for the popover beside it
  const keys = b.state?.keys ?? [];
  const isSaving = (ear: number, taps: number) => saving?.ear === ear && saving.taps === taps;
  const fnOf = (ear: number, taps: number) => (isSaving(ear, taps) ? saving!.fn : keys.find((k) => k.ear === ear && k.taps === taps)?.fn);
  const tapCounts = [...new Set(keys.map((k) => k.taps))].sort((x, y) => x - y);
  const current = picking && fnOf(picking.ear, picking.taps);
  const choose = (fn: number) => {
    if (!picking) return;
    const { ear, taps } = picking;
    tick();
    setPicking(undefined);
    if (fn === current) return;
    const mine = { ear, taps, fn };
    setSaving(mine);
    void b.run((e) => e.setKey(ear, taps, fn))().finally(() => setSaving((x) => (x === mine ? undefined : x)));
  };
  const title = picking ? `${EARS[picking.ear - 1].label} earbud · ${gesture(picking.taps)}` : "";
  const sheet = (
    <>
    <Popover anchor={picking && anchor ? anchor : undefined} label={title} onClose={() => setPicking(undefined)}>
      <Txt v="small" muted style={s.popTitle}>
        {title}
      </Txt>
      {P.keyFunctions.map((f) => {
        const on = f.fn === current;
        return <MenuRow key={f.fn} label={f.name} on={on} icon={<FnGlyph fn={f.fn} on={on} color={on ? c.signalInk : c.ink} size={20} />} onPress={() => choose(f.fn)} />;
      })}
    </Popover>
    <Sheet
        open={!!picking && !anchor}
        tablet={tablet}
        title={title}
        sub="Pick what it does. It's saved on the earbuds."
        onClose={() => setPicking(undefined)}
      >
        <View style={s.fns}>
          {P.keyFunctions.map((f) => {
            const on = f.fn === current;
            return (
              <Press
                key={f.fn}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => choose(f.fn)}
                style={[s.fn, { backgroundColor: on ? c.tint : c.well, borderColor: on ? c.tintEdge : "transparent" }]}
              >
                <FnGlyph fn={f.fn} on={on} color={on ? c.signalInk : c.ink} size={24} />
                <Txt v="small" style={{ textAlign: "center", color: on ? c.signalInk : c.ink }}>
                  {f.name}
                </Txt>
              </Press>
            );
          })}
        </View>
    </Sheet>
    </>
  );
  /** Opens the actions for a gesture: beside `from` (what was tapped) on a tablet, else as a sheet. */
  const pick = (ear: number, taps: number, from?: unknown) => {
    const beside = tablet && measureAnchor(from, (a) => {
      setAnchor(a);
      setPicking({ ear, taps });
    });
    if (beside) return;
    setAnchor(undefined);
    setPicking({ ear, taps });
  };
  return { sheet, pick, fnOf, isSaving, tapCounts };
}

type KeyPicker = ReturnType<typeof useKeyPicker>;

export function TouchPage({ b, ui }: { b: BudPilot; ui: Ui }) {
  const c = useColors();
  const k = useKeyPicker(b, ui.tablet);
  if (b.status !== "connected" || !b.state) return <NotConnected b={b} />;
  const state = b.state;
  return (
    <View style={s.stack}>
      {k.sheet}
      <TapsTiles k={k} />
      <Card>
        <CardHead title="Built in" right={<Txt v="sub">Can&apos;t be changed</Txt>} />
        <TouchFacts />
      </Card>
      {state.wearDetection !== undefined && (
        <Card>
          <WearRow b={b} first />
        </Card>
      )}
      {b.error ? (
        <Txt v="sub" style={{ color: c.danger }}>
          {b.error}
        </Txt>
      ) : null}
    </View>
  );
}

/** One tap's action, as shown in the designs: its name (or "Saving…" while the earbuds take a new one). */
const actionText = (k: KeyPicker, ear: number, taps: number) => {
  const fn = k.fnOf(ear, taps);
  return k.isSaving(ear, taps) ? "Saving…" : fn === undefined ? "—" : fnName(fn);
};
const actionLabel = (k: KeyPicker, ear: number, taps: number) => {
  const fn = k.fnOf(ear, taps);
  return `${EARS[ear - 1].label} earbud, ${gesture(taps)}: ${fn === undefined ? "not set" : fnName(fn)}. Change`;
};

/** The taps (the user's pick of three designs): Left or Right, then a large tile per tap, its action in a filled accent
 * circle and its name big, the tap under it. Tap a tile to choose what it does. */
function TapsTiles({ k }: { k: KeyPicker }) {
  const c = useColors();
  const [ear, setEar] = useState(1);
  return (
    <Card>
      <Seg label="Earbud" options={EARS.map((e) => ({ value: e.ear, label: `${e.label} earbud` }))} value={ear} onChange={setEar} />
      {k.tapCounts.map((taps) => {
        const fn = k.fnOf(ear, taps);
        return (
          <Press
            key={taps}
            scale={0.98}
            accessibilityRole="button"
            accessibilityLabel={actionLabel(k, ear, taps)}
            onPress={(ev) => fn !== undefined && k.pick(ear, taps, ev.currentTarget)}
            style={[s.bigTile, { backgroundColor: c.well }]}
          >
            <View style={[s.bigIcon, { backgroundColor: c.signalFill }]}>{fn !== undefined && <FnGlyph fn={fn} on color={c.onSignal} size={24} />}</View>
            <View style={s.grow}>
              <Text style={[s.bigName, { color: c.ink }, k.isSaving(ear, taps) && s.saving]}>{actionText(k, ear, taps)}</Text>
              <Txt v="sub">{gesture(taps)}</Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.ink2} />
          </Press>
        );
      })}
    </Card>
  );
}

/** Wear detection, where the earbuds have it. */
export function WearRow({ b, first }: { b: BudPilot; first?: boolean }) {
  const on = b.state?.wearDetection;
  if (on === undefined) return null;
  return <ToggleRow first={first} icon="ear-outline" title="Wear detection" detail="Senses when they're in your ears" value={on} onChange={(v) => void b.run((e) => e.setWearDetection(v))()} />;
}

const FACTS: { icon: ComponentProps<typeof Ionicons>["name"]; k: string; v: string }[] = [
  { icon: "hand-left-outline", k: "Press and hold", v: "Off → ANC → Transparency" },
  { icon: "call-outline", k: "Incoming call", v: "Tap answers" },
  { icon: "close-circle-outline", k: "During a call", v: "Double tap hangs up" },
];

/** What the earbuds do that can't be changed: press and hold, and calls; each with its icon. */
export function TouchFacts() {
  const c = useColors();
  return (
    <View style={s.facts}>
      {FACTS.map((f) => (
        <View key={f.k} style={s.fact}>
          <View style={[s.factIcon, { backgroundColor: c.well }]}>
            <Ionicons name={f.icon} size={18} color={c.ink2} />
          </View>
          <View style={s.grow}>
            <Txt v="strong">{f.k}</Txt>
            <Txt v="sub">{f.v}</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.kv}>
      <Txt>{k}</Txt>
      <Txt v="sub" style={s.kvV}>
        {v}
      </Txt>
    </View>
  );
}

// ───────── App ─────────

/** "Run without limits": whether Android may pause Shono in the background, and its question to change that. */
function BackgroundCard() {
  const [free, setFree] = useState(backgroundUnrestricted);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && setFree(backgroundUnrestricted()));
    return () => sub.remove();
  }, []);
  return (
    <Card>
      <CardHead title="Background" />
      <Txt v="strong">Run without limits</Txt>
      <Txt v="sub">
        {free
          ? "On. Android lets Shono keep your noise setting and note Last seen in the background."
          : "Off. Android may pause Shono in the background to save battery, and then it can't keep your noise setting or note Last seen."}
      </Txt>
      {!free && <Button label="Allow" kind="out" onPress={() => void askBackgroundUnrestricted()} />}
    </Card>
  );
}

/** Shono's log on the phone: share it (to send it for a look) or clear it before a test. */
function LogCard() {
  const [cleared, setCleared] = useState(false);
  return (
    <Card>
      <CardHead title="Troubleshooting" />
      <Txt v="sub">
        A log of what your earbuds and phone do: messages from the earbuds, volume changes, and Shono going to the background and back. It stays on
        this phone unless you share it.
      </Txt>
      <View style={s.btns}>
        <Button
          label="Share log"
          kind="out"
          onPress={() => void readLog().then((text) => Share.share({ title: "Shono log", message: text || "The log is empty." }).catch(() => undefined))}
        />
        <Button
          label={cleared ? "Cleared" : "Clear log"}
          kind="out"
          onPress={() => {
            clearLog();
            setCleared(true);
            setTimeout(() => setCleared(false), 1500);
          }}
        />
      </View>
    </Card>
  );
}

const THEMES = [
  { value: "system" as const, label: "System" },
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
];
const LINKS = [
  { label: `${CREDIT_NAME} on X`, url: "https://x.com/mrbrainaxes", Logo: XLogo },
  { label: `${CREDIT_NAME} on GitHub`, url: "https://github.com/wahidalways/Shono", Logo: GitHubLogo },
];

/** The accent colours (App settings, and the first run's Make it yours): each a swatch with a tick on the chosen one,
 * its name under them. */
export function AccentPicker() {
  const { c, look, setLook } = useTheme();
  const chosen = ACCENTS.find((a) => a.key === look.accent) ?? ACCENTS[0];
  return (
    <View style={s.accents}>
      <View style={s.swatches} accessibilityRole="radiogroup" accessibilityLabel="Accent colour">
        {ACCENTS.map((a) => {
          const on = a.key === chosen.key;
          return (
            <Press
              key={a.key}
              scale={0.86} // answers the finger at once; the new colours take a moment to reach every screen
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={a.name}
              hitSlop={4}
              onPress={() => {
                tick();
                setLook({ accent: a.key });
              }}
              style={[s.swatch, { backgroundColor: hsl(a.h, a.s, a.fill ?? 50), borderColor: on ? c.ink : "transparent", alignItems: "center", justifyContent: "center" }]}
            >
              {on && <Ionicons name="checkmark" size={18} color={a.darkText ? "#12151C" : "#FFFFFF"} />}
            </Press>
          );
        })}
      </View>
      <Txt v="small" muted>
        {chosen.name}
      </Txt>
    </View>
  );
}

/** Appearance, the earbuds, and about Shono: a sheet from Home's gear on phones, a page on tablets. `onTour`: replays the
 * welcome tour; `onFirstRun` (development only): shows the first run again. */
export function AppContent({ b, onTour, onFirstRun }: { b: BudPilot; onTour?: () => void; onFirstRun?: () => void }) {
  const { c, look, setLook } = useTheme();
  const { glass } = useGlass();
  const live = b.status === "connected" && !!b.state;
  return (
    <View style={s.stack}>
      <Card>
        <CardHead title="Appearance" />
        <Txt v="sub">Theme</Txt>
        <Seg label="Theme" options={THEMES} value={look.theme} onChange={(theme) => setLook({ theme })} />
        <Txt v="sub">Accent colour</Txt>
        <AccentPicker />
        <Txt v="sub">Battery bars</Txt>
        <Seg label="Battery bars" options={BATTERY_STYLES} value={look.battery ?? "segments"} onChange={(battery) => setLook({ battery })} />
        {Platform.OS !== "ios" && (
          <ToggleRow
            title="Full screen"
            detail="Hides the status and navigation bars. Swipe in from the top or bottom edge to see them."
            value={look.fullScreen !== false}
            onChange={(fullScreen) => setLook({ fullScreen })}
          />
        )}
        <ToggleRow
          title="Glass and motion"
          detail="Frosted bars and see-through cards. Off is plainer and saves a little battery."
          value={glass}
          onChange={(glass) => setLook({ glass })}
        />
      </Card>
      <Card>
        <CardHead title="Earbuds" />
        <KV k={live ? b.state!.name : "Your earbuds"} v={live ? "Connected" : b.status === "reconnecting" ? "Waiting" : b.status === "connecting" ? "Connecting…" : "Not connected"} />
        <KV k="Supported earbuds" v="HOCO EQ35 ANC · more coming" />
        <Txt v="sub">{usingSample() ? "Sample earbuds: Expo Go has no Bluetooth. Install the Shono app to use real ones." : "One app at a time: close other apps that control your earbuds first."}</Txt>
        {live || b.status === "reconnecting" ? (
          <Button label="Disconnect" kind="out" onPress={() => void b.disconnect()} />
        ) : (
          <Button label={b.status === "connecting" ? "Connecting…" : "Connect"} kind="pri" onPress={() => b.status === "idle" && void b.connect()} />
        )}
      </Card>
      {keeperAvailable() && <BackgroundCard />}
      {keeperAvailable() && <LogCard />}
      <Card>
        <View style={s.about}>
          <Lockup size={36} />
          <Txt v="sub">Version {appConfig.expo.version}</Txt>
        </View>
        <Txt v="sub">
          Made by <Text style={{ color: c.ink, fontFamily: F.semibold }}>{CREDIT_NAME}</Text>
        </Txt>
        <View style={s.links}>
          {LINKS.map(({ label, url, Logo }) => (
            <Press
              key={url}
              accessibilityRole="link"
              accessibilityLabel={label}
              accessibilityHint="Opens in your browser"
              onPress={() => void Linking.openURL(url).catch(() => undefined)}
              style={[s.link, { backgroundColor: c.well }]}
            >
              <Logo color={c.ink} />
            </Press>
          ))}
        </View>
        {onTour && <Button label="Show the welcome tour" kind="out" onPress={onTour} />}
        {__DEV__ && onFirstRun && <Button label="Show the first run again (testing)" kind="out" onPress={onFirstRun} />}
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  stack: { gap: 12 },
  two: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  about: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  actSlot: { height: 44, marginTop: 2 }, // a button's height: the space it saves went to the curve
  acts: { flexDirection: "row", gap: 8 },
  act: { height: 44, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actGrow: { flex: 1, paddingHorizontal: 8 },
  actOff: { opacity: 0.4 },
  actIcon: { width: 48 },
  lede: { fontSize: 14, marginTop: -4, marginBottom: 4, paddingHorizontal: 4 },
  field: { height: 184, paddingTop: 4, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", overflow: "hidden" }, // the art at the top, the mode's name under it
  fieldCap: { position: "absolute", left: 18, bottom: 14 },
  fieldMode: { fontFamily: F.display, fontSize: 20, lineHeight: 24 },
  glow: { position: "absolute", left: 166, top: 0, width: 140, height: 140, borderRadius: 70 },
  gameName: { gap: 6 },
  wave: { position: "absolute", left: 189, top: 44 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minWidth: 0, borderRadius: 20, borderWidth: 1.5, padding: 10, paddingTop: 14, gap: 6, minHeight: 126 },
  tick: { position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  // the hint and the stepper share one fixed height: neither changes the card's size
  note: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingHorizontal: 4, height: 44 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12, height: 44 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  stepMid: { flex: 1, alignItems: "center" },
  form: { gap: 6, paddingBottom: 4 },
  input: { height: 50, borderRadius: 14, paddingHorizontal: 14 },
  btns: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  glyphBig: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  turbo: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", height: 28, paddingHorizontal: 10, borderRadius: 14 },
  bigTile: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bigIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  bigName: { fontFamily: F.display, fontSize: 17, lineHeight: 22 },
  saving: { opacity: 0.6 },
  facts: { gap: 12 },
  fact: { flexDirection: "row", alignItems: "center", gap: 12 },
  factIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  fns: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 6 },
  popTitle: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  small: { height: 28, paddingHorizontal: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" }, // the heading's own height: the card never grows
  dots: { width: 34, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  value: { flexDirection: "row", alignItems: "center", gap: 4, height: 34, paddingLeft: 12, paddingRight: 8, borderRadius: 17, maxWidth: 170 },
  accents: { gap: 8 },
  check: { position: "absolute" },  rule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  curveRoom: { flex: 1, minHeight: 230, justifyContent: "center" },
  chipsHead: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  chipsGap: { height: 10 },
  fn: { width: "31.5%", minHeight: 86, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 8, padding: 8 },
  kv: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 40 },
  kvV: { flexShrink: 1, textAlign: "right" },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 4 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  links: { flexDirection: "row", gap: 8 },
  link: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
