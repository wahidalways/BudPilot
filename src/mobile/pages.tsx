// The phone's tabs and the tablet's pages: Sound, Equalizer, Game, Touch controls, and App settings.
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { G, Path } from "react-native-svg";

import { usingSample } from "@/ble/connect";
import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { ancOn } from "@/hooks/use-earbuds";
import { ANC_LEVELS } from "@/hooks/use-adaptive-anc";
import { EqCurve } from "@/screens/home/eq-curve";
import { CREDIT_NAME, gameEqChoices, MODE_SUBS, eqChoices } from "@/screens/home/parts";
import { fnName, gesture } from "@/screens/home/touch-controls";
import { type BudPilot, modeName } from "@/screens/home/use-bud-pilot";
import { useEqEditor } from "@/screens/home/use-eq-editor";
import { ACCENTS, F, hsl, useColors, useTheme } from "@/theme";
import { BoltIcon, BudIcon, EAR, FnIcon, GitHubLogo, NavIcon, NoiseIcon, XLogo } from "@/ui/icons";
import { GAME_EQ, GAME_EQ_NAME } from "@/utils/game";
import { MAX_NAME } from "@/utils/my-eqs";

import appConfig from "../../app.json";

import { CheckIcon, Dots, InfoIcon } from "./art";
import { PHONE_STRENGTHS } from "./home";
import { Button, Card, CardHead, Pill, Pills, Press, Seg, Switch, T, tick, ToggleRow, Txt } from "./kit";
import { Sheet } from "./sheet";

/** What pages need to know about where they are. */
export type Ui = { tablet: boolean };

/** Shown on a page that needs the earbuds while they aren't connected. */
export function NotConnected({ b }: { b: BudPilot }) {
  return (
    <Card>
      <Txt v="strong">{b.status === "reconnecting" ? "Waiting for your earbuds" : b.status === "connecting" ? "Connecting…" : "Not connected"}</Txt>
      <Txt v="sub">{b.status === "idle" ? "Connect your earbuds to change this." : "Open the case. Shono connects by itself."}</Txt>
      {b.status === "idle" && <Button label="Connect" kind="pri" onPress={() => void b.connect()} />}
    </Card>
  );
}

// ───────── Sound ─────────

/** What each noise mode does to the room: sound waves come in from the left; ANC stops them at a wall (thicker with
 * strength), Transparency lets them reach your ear, Off leaves them faint. */
function Field({ mode, level }: { mode: number; level: number }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(0);
    if (!reduce) t.set(withRepeat(withTiming(1, { duration: mode === 0 ? 3200 : 2400, easing: Easing.linear }), -1));
  }, [mode, reduce, t]);
  const wall = [2.5, 5, 8][level] ?? 5;
  const scale = Math.min(1, (width - 64) / 360);
  return (
    <View style={[s.field, { backgroundColor: c.raised, borderColor: c.hair }]} aria-hidden>
      <View style={{ width: 360, height: 150, transform: [{ scale }] }}>
        {[0, 1, 2].map((k) => (
          <Wave key={k} t={t} phase={k / 3} mode={mode} reduce={reduce} color={c.signal} />
        ))}
        <Svg width={360} height={150} style={StyleSheet.absoluteFill}>
          {mode === 1 && <Path d="M196 38a52 52 0 0 1 0 74" stroke={c.signalInk} strokeWidth={wall} strokeLinecap="round" fill="none" />}
          <G transform="translate(196 33) scale(3.5)">
            <Path d={EAR} stroke={c.ink} strokeWidth={0.66} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </G>
        </Svg>
      </View>
      <Text style={[T.small, s.fieldCap, { color: c.ink2 }]}>
        <Text style={{ color: c.ink, fontFamily: F.semibold }}>{modeName(mode)}</Text>
        {mode === 1 ? ` · ${P.ancLevels[level]?.name ?? ""}` : ""}
      </Text>
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
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => p.set(withSpring(on ? 1 : 0, { dampingRatio: 0.6, duration: 420 })), [on, p]);
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
      style={[s.tile, { backgroundColor: on ? c.tint : c.raised, borderColor: on ? c.tintEdge : c.hair }]}
    >
      <Animated.View style={[s.tick, { backgroundColor: c.signalFill }, tickStyle]}>
        <CheckIcon color={c.onSignal} size={12} />
      </Animated.View>
      <NoiseIcon mode={mode} color={on ? c.signalInk : c.ink} size={30} />
      <Txt v="strong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: F.semibold, fontSize: 14 }}>
        {modeName(mode)}
      </Txt>
      <Txt v="sub" style={{ fontSize: 12 }}>
        {MODE_SUBS[mode]}
      </Txt>
    </Press>
  );
}

export function SoundPage({ b }: { b: BudPilot }) {
  if (!b.state) return <NotConnected b={b} />;
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
      {state.anc === 1 && (
        <Animated.View entering={FadeIn.duration(260)}>
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
      <Card>
        <ToggleRow
          first
          title="Keep my noise setting"
          detail="Undoes the earbuds' own switches, even when Shono is in the background (it shows a small notification). Press and hold still works."
          value={b.keep}
          onChange={b.setKeep}
        />
        <ToggleRow title="Tell me when Shono steps in" detail="When it puts your noise setting back" value={b.notice.on} onChange={b.notice.setOn} />
      </Card>
    </View>
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

export function EqPage({ b, ui }: { b: BudPilot; ui: Ui }) {
  if (!b.state) return <NotConnected b={b} />;
  return <Eq b={b} ui={ui} />;
}

function Eq({ b, ui }: { b: BudPilot; ui: Ui }) {
  const c = useColors();
  const e = useEqEditor(b);
  const my = b.myEqs;
  const [deleting, setDeleting] = useState<{ id: string; name: string }>();
  const name = e.kind === "game" ? GAME_EQ_NAME : e.kind === "preset" ? (P.eqPresets.find((p) => p.mode === b.state!.eqMode)?.name ?? "Preset") : (e.playing?.name ?? "Custom");
  return (
    <View style={s.stack}>
      <Sheet
        open={!!e.naming}
        tablet={ui.tablet}
        title={e.naming?.id ? "Rename" : "Save as…"}
        sub={e.naming?.id ? "New name" : e.kind === "preset" ? "Starts flat. Drag the points to shape it." : "Saves a copy of what's playing now."}
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
      <Txt v="sub" style={s.lede}>
        {EQ_LEDE[e.kind]}
      </Txt>
      <Card>
        <CardHead title={name} right={<Txt v="sub">{{ game: "Game mode", preset: "Preset", mine: "Saved", custom: "Not saved" }[e.kind]}</Txt>} />
        <EqCurve
          bands={P.eqBands}
          gains={e.kind === "game" ? GAME_EQ : e.gains}
          max={P.eqMax}
          faded={e.kind !== "game" && e.faded}
          readOnly={e.kind === "game"}
          onChange={e.setDraft}
          onCommit={e.commit}
          height={ui.tablet ? 280 : 220}
        />
        <View style={s.note}>
          <InfoIcon color={c.ink2} size={15} />
          <Txt v="sub" style={s.grow}>
            {e.kind === "game"
              ? "Your EQ comes back when Game mode turns off."
              : e.kind === "preset"
                ? "The earbuds play their own stored curve for presets."
                : e.kind === "mine"
                  ? `Changes save into “${e.playing!.name}” as you drag.`
                  : "Drag a point. Save it to keep it."}
          </Txt>
        </View>
      </Card>
      <Card>
        <CardHead title="Sound" />
        <Pills>
          {eqChoices(b).map((ch) => (
            <Pill key={ch.key} label={ch.label} on={ch.on} onPress={ch.onPress} />
          ))}
          <Pill add label="New" on={false} onPress={e.startNew} />
        </Pills>
      </Card>
      <View style={s.btns}>
        {e.kind === "custom" && <Button label="Save as…" kind="pri" onPress={() => e.setNaming({ name: "" })} />}
        {e.kind === "mine" && <Button label="Rename" kind="out" onPress={() => e.setNaming({ id: e.playing!.id, name: e.playing!.name })} />}
        {(e.kind === "custom" || e.kind === "mine") && !e.isFlat && <Button label="Reset to flat" kind="out" onPress={e.resetToFlat} />}
        {e.kind === "mine" && <Button label="Delete" kind="danger" onPress={() => setDeleting({ id: e.playing!.id, name: e.playing!.name })} />}
        {e.kind === "game" && <Button label={`Turn off ${GAME_EQ_NAME}`} kind="out" onPress={() => b.game.setEqOn(false)} />}
      </View>
    </View>
  );
}

// ───────── Game ─────────

/** The bolt beside "Low delay on": pulses three times when Game mode comes on, then stays lit. */
function Turbo({ on }: { on: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const p = useSharedValue(1);
  useEffect(() => {
    if (on && !reduce) p.set(withRepeat(withSequence(withTiming(1.5, { duration: 260 }), withTiming(1, { duration: 260 })), 3));
  }, [on, reduce, p]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: p.get() }], opacity: 2 - p.get() }));
  return (
    <View style={[s.turbo, { backgroundColor: on ? c.tint : c.well }]}>
      <Animated.View style={a}>
        <BoltIcon color={on ? c.signalInk : c.ink2} />
      </Animated.View>
      <Text style={[T.small, { fontFamily: F.semibold, color: on ? c.signalInk : c.ink2 }]}>{on ? "Low delay on" : "Normal delay"}</Text>
    </View>
  );
}

export function GamePage({ b }: { b: BudPilot }) {
  const c = useColors();
  if (!b.state) return <NotConnected b={b} />;
  const g = b.game;
  return (
    <View style={s.stack}>
      <Card>
        <View style={s.row}>
          <View style={[s.glyphBig, { backgroundColor: g.active ? c.tint : c.well }]}>
            <NavIcon panel="game" color={g.active ? c.signalInk : c.ink2} size={28} />
          </View>
          <View style={s.grow}>
            <Txt v="name" style={{ fontSize: 18 }}>
              Game mode
            </Txt>
            <Txt v="sub">Sound lines up with what you see</Txt>
          </View>
          <Switch value={g.active} onChange={g.setOn} label="Game mode" />
        </View>
        <Turbo on={g.active} />
      </Card>
      <Card>
        <ToggleRow first title="EQ while gaming" detail="Plays while Game mode is on. Your own EQ comes back after." value={g.prefs.eqOn} onChange={g.setEqOn} />
        {g.prefs.eqOn && (
          <Animated.View entering={FadeIn.duration(240)}>
            <Pills>
              {gameEqChoices(b).map((ch) => (
                <Pill key={ch.key} label={ch.label} on={ch.on} onPress={ch.onPress} />
              ))}
            </Pills>
          </Animated.View>
        )}
      </Card>
      <View style={s.note}>
        <InfoIcon color={c.ink2} size={15} />
        <Txt v="sub" style={s.grow}>
          Turning on by itself for full-screen games needs Shono for Windows.
        </Txt>
      </View>
    </View>
  );
}

// ───────── Touch controls ─────────

const EARS = [
  { ear: 1, label: "Left" },
  { ear: 2, label: "Right" },
];

export function TouchPage({ b, ui }: { b: BudPilot; ui: Ui }) {
  const c = useColors();
  // a choice on its way to the earbuds: shown at once, kept only once they confirm it (otherwise the error shows)
  const [saving, setSaving] = useState<{ ear: number; taps: number; fn: number }>();
  const [picking, setPicking] = useState<{ ear: number; taps: number }>(); // the gesture whose action is being chosen
  if (!b.state) return <NotConnected b={b} />;
  const state = b.state;
  const isSaving = (ear: number, taps: number) => saving?.ear === ear && saving.taps === taps;
  const fnOf = (ear: number, taps: number) => (isSaving(ear, taps) ? saving!.fn : state.keys.find((k) => k.ear === ear && k.taps === taps)?.fn);
  const tapCounts = [...new Set(state.keys.map((k) => k.taps))].sort((x, y) => x - y);
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
  return (
    <View style={s.stack}>
      <Sheet
        open={!!picking}
        tablet={ui.tablet}
        title={picking ? `${EARS[picking.ear - 1].label} earbud · ${gesture(picking.taps)}` : ""}
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
                <FnIcon fn={f.fn} color={on ? c.signalInk : c.ink} size={24} />
                <Txt v="small" style={{ textAlign: "center", color: on ? c.signalInk : c.ink }}>
                  {f.name}
                </Txt>
              </Press>
            );
          })}
        </View>
      </Sheet>
      <View style={ui.tablet ? s.two : s.stack}>
        {EARS.map((e) => (
          <Card key={e.ear} style={ui.tablet && s.grow}>
            <View style={s.row}>
              <View style={[s.glyphSmall, { backgroundColor: c.well }]}>
                <BudIcon color={c.ink2} flip={e.ear === 2} />
              </View>
              <Txt v="head">{e.label} earbud</Txt>
            </View>
            {tapCounts.map((taps, i) => {
              const fn = fnOf(e.ear, taps);
              return (
                <Pressable
                  key={taps}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.label} ${gesture(taps)}: ${fn === undefined ? "not set" : fnName(fn)}. Change`}
                  onPress={() => fn !== undefined && setPicking({ ear: e.ear, taps })}
                  style={({ pressed }) => [s.gest, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hair }, pressed && { backgroundColor: c.well }]}
                >
                  <Dots n={taps} color={c.ink} />
                  <View style={s.grow}>
                    <View style={s.inline}>
                      {fn !== undefined && <FnIcon fn={fn} color={c.signalInk} size={18} />}
                      <Txt v="strong" style={{ opacity: isSaving(e.ear, taps) ? 0.6 : 1 }}>
                        {fn === undefined ? "—" : fnName(fn)}
                      </Txt>
                    </View>
                    <Txt v="sub">{isSaving(e.ear, taps) ? `${gesture(taps)} · Saving…` : gesture(taps)}</Txt>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        ))}
      </View>
      <View style={ui.tablet ? s.two : s.stack}>
        <Card style={ui.tablet && s.grow}>
          <CardHead title="Press and hold" />
          <KV k="Noise control" v="Off → ANC → Transparency" />
        </Card>
        <Card style={ui.tablet && s.grow}>
          <CardHead title="Calls" />
          <KV k="Incoming call" v="Tap answers" />
          <KV k="During a call" v="Double tap hangs up" />
        </Card>
      </View>
      {state.wearDetection !== undefined && (
        <Card>
          <ToggleRow first title="Wear detection" detail="Senses when they're in your ears" value={state.wearDetection} onChange={(on) => void b.run((e) => e.setWearDetection(on))()} />
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

const THEMES = [
  { value: "system" as const, label: "System" },
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
];
const LINKS = [
  { label: `${CREDIT_NAME} on X`, url: "https://x.com/mrbrainaxes", Logo: XLogo },
  { label: `${CREDIT_NAME} on GitHub`, url: "https://github.com/wahidalways/Shono", Logo: GitHubLogo },
];

/** Appearance, the earbuds, and about Shono: a sheet from Home's gear on phones, a page on tablets. `onTour`: replays the
 * welcome tour; `onFirstRun` (development only): shows the first run again. */
export function AppContent({ b, onTour, onFirstRun }: { b: BudPilot; onTour?: () => void; onFirstRun?: () => void }) {
  const { c, look, setLook } = useTheme();
  const live = b.status === "connected" && !!b.state;
  return (
    <View style={s.stack}>
      <Card>
        <CardHead title="Appearance" />
        <Txt v="sub">Theme</Txt>
        <Seg label="Theme" options={THEMES} value={look.theme} onChange={(theme) => setLook({ theme })} />
        <Txt v="sub">Accent colour</Txt>
        <View style={s.swatches}>
          {ACCENTS.map((a) => {
            const on = look.accent === a.key;
            return (
              <Pressable
                key={a.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={a.name}
                onPress={() => {
                  tick();
                  setLook({ accent: a.key });
                }}
                style={[s.swatch, { backgroundColor: hsl(a.h, a.s, 50), borderColor: on ? c.ink : "transparent" }]}
              />
            );
          })}
        </View>
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
      <Card>
        <CardHead title={`Shono ${appConfig.expo.version}`} />
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
  lede: { fontSize: 14, marginTop: -4, marginBottom: 4, paddingHorizontal: 4 },
  field: { height: 150, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  fieldCap: { position: "absolute", right: 16, bottom: 12 },
  wave: { position: "absolute", left: 189, top: 44 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minWidth: 0, borderRadius: 20, borderWidth: 1.5, padding: 10, paddingTop: 14, gap: 6, minHeight: 126 },
  tick: { position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingHorizontal: 4 },
  form: { gap: 6, paddingBottom: 4 },
  input: { height: 50, borderRadius: 14, paddingHorizontal: 14 },
  btns: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  glyphBig: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  glyphSmall: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  turbo: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", height: 28, paddingHorizontal: 10, borderRadius: 14 },
  gest: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingHorizontal: 6 },
  fns: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 6 },
  fn: { width: "31.5%", minHeight: 86, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 8, padding: 8 },
  kv: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 40 },
  kvV: { flexShrink: 1, textAlign: "right" },
  swatches: { flexDirection: "row", gap: 14, paddingVertical: 4 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  links: { flexDirection: "row", gap: 8 },
  link: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
