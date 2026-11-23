// Pieces both views share: the tray flyout and the settings window.
import { useEffect, useRef, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { ANC_LEVELS } from "@/hooks/use-adaptive-anc";
import { ancOn, type NoisePref } from "@/hooks/use-earbuds";
import { canDetectGames } from "@/hooks/use-game-mode";
import { GAME_EQ_NAME } from "@/utils/game";
import type { Battery as BatteryLevel } from "@/jieli/earbuds";
import { F, useColors } from "@/theme";
import { BoltIcon, BudIcon, ChevronIcon, GitHubLogo, NoiseIcon, XLogo } from "@/ui/icons";
import { Button, Card, controlStyle, css, Dot, Pill, pillLook, Seg, Switch, Tile, Txt } from "@/ui/kit";
import { nearestIndex } from "@/utils/adaptive-anc";
import { type Correction, seconds } from "@/utils/corrections";

import { type BudPilot, modeName } from "./use-bud-pilot";

const levelName = (level: number) => P.ancLevels[nearestIndex(level, ANC_LEVELS)]?.name ?? "";

/** What Shono is holding, in a few words: "Off", "ANC Mid", "ANC Adaptive". */
export const keepText = (p: NoisePref) => (p.mode === 1 ? `ANC ${p.adaptive ? "Adaptive" : levelName(p.ncLevel)}` : modeName(p.mode));

export const batteryLine = (b: BudPilot) => {
  const bat = b.state?.battery;
  const pct = (x?: BatteryLevel) => (x ? `${x.percent}%` : "—");
  return bat ? `L ${pct(bat.left)} · R ${pct(bat.right)} · Case ${pct(bat.case)}` : "";
};

/** The put-back that just happened (for a couple of seconds), so the views can show it. */
export function useJustCorrected(corrections: Correction[]) {
  const [since] = useState(() => Date.now()); // only put-backs from now on
  const [expired, setExpired] = useState<number>(); // the last one whose moment has passed
  const latest = corrections[0];
  useEffect(() => {
    if (!latest || latest.at < since) return;
    const t = setTimeout(() => setExpired(latest.at), 2200);
    return () => clearTimeout(t);
  }, [latest, since]);
  return latest && latest.at >= since && expired !== latest.at ? latest : undefined;
}

/** The keep chip's words, [lead, strong, tail]: "Keeping Off", "Putting ANC back", or "Undid ANC 0.12 s" right after a
 * put-back (`loud`). Undefined when Shono isn't keeping a setting. */
export function keepChipParts(b: BudPilot, just?: Correction) {
  if (!b.keep || !b.noisePref) return undefined;
  const putting = b.putting;
  const text: [string, string, string] = putting
    ? ["Putting ", modeName(putting.to), " back"]
    : just
      ? [`Undid ${modeName(just.from)} `, seconds(just.ms), ""]
      : ["Keeping ", keepText(b.noisePref), ""];
  return { text, loud: !!just && !putting };
}

/** "Keeping Off" chip; flashes "Undid ANC 0.12 s" right after a put-back. Short and fixed-length, so it never widens the flyout. */
export function KeepChip({ b }: { b: BudPilot }) {
  const c = useColors();
  const parts = keepChipParts(b, useJustCorrected(b.corrections));
  if (!parts) return null;
  const { loud } = parts;
  const [lead, strong, tail] = parts.text;
  return (
    <View accessibilityLabel={`${lead}${strong}${tail}`} style={[s.chip, { backgroundColor: loud ? c.signalFill : c.tint, boxShadow: c.shine }]}>
      <Dot color={loud ? c.onSignal : c.signalFill} />
      <Text numberOfLines={1} style={[s.chipText, { color: loud ? c.onSignal : c.signalInk }]}>
        {lead}
        <Text style={s.chipStrong}>{strong}</Text>
        {tail}
      </Text>
    </View>
  );
}

type Photo = { uri: string; aspect: number };

/** One battery: its photo over a soft shadow, the name (⚡ while charging), the percent, and a battery-shaped bar (green charging, amber
 * at 20 % or less, red at 10 % or less). */
function Battery({ label, level, photo, onPhotoError }: { label: string; level: BatteryLevel; photo?: Photo; onPhotoError?: () => void }) {
  const c = useColors();
  const pct = level?.percent ?? 0;
  const tone = !level ? c.ink2 : level.charging ? c.ok : pct <= 10 ? c.danger : pct <= 20 ? c.warn : c.ink;
  const fill = !level ? c.ink2 : level.charging ? c.ok : pct <= 10 ? c.danger : pct <= 20 ? c.warn : c.signal;
  return (
    <View
      style={s.battery}
      accessible
      accessibilityLabel={`${label} battery ${level ? `${level.percent} percent${level.charging ? ", charging" : ""}` : "not available"}`}
    >
      {photo && (
        <View style={s.photoBox}>
          <View style={[s.shadow, { backgroundColor: c.ink }, !level && s.photoGone]} />
          <Image source={{ uri: photo.uri }} onError={onPhotoError} resizeMode="contain" style={[s.photo, { aspectRatio: photo.aspect }, !level && s.photoGone]} />
        </View>
      )}
      <View style={s.inline}>
        <Txt v="sub" style={s.batteryLabel}>
          {label}
        </Txt>
        {level?.charging && <BoltIcon color={c.ok} />}
      </View>
      <Text style={[s.pct, { color: tone }]}>
        {level ? level.percent : "—"}
        {level && <Text style={[s.pctSign, { color: c.ink2 }]}>%</Text>}
      </Text>
      <View style={s.cell}>
        <View style={[s.cellBody, { backgroundColor: c.well }]}>
          <View style={[s.cellFill, { width: `${pct}%`, backgroundColor: fill }]} />
        </View>
        <View style={[s.cellCap, { backgroundColor: c.well }]} />
      </View>
    </View>
  );
}

/** Name, connection, and the three batteries, in one card, each under its photo when this computer has the photos. */
export function DeviceCard({ b }: { b: BudPilot }) {
  const c = useColors();
  const bat = b.state!.battery;
  const [photos, setPhotos] = useState(true); // off once one fails to load (not on this computer)
  const photo = (key: keyof typeof P.photos) => (photos ? P.photos[key] : undefined);
  const noPhotos = () => setPhotos(false);
  return (
    <Card style={s.device}>
      <View style={s.between}>
        <Txt v="name" numberOfLines={1} style={s.grow}>
          {b.state!.name}
        </Txt>
        <View style={s.inline}>
          <Dot color={c.ok} />
          <Txt v="sub">{b.busy ? "Sending…" : "Connected"}</Txt>
        </View>
      </View>
      <View style={s.batteries}>
        <Battery label="Left" level={bat.left} photo={photo("left")} onPhotoError={noPhotos} />
        <Battery label="Right" level={bat.right} photo={photo("right")} onPhotoError={noPhotos} />
        <Battery label="Case" level={bat.case} photo={photo("case")} onPhotoError={noPhotos} />
      </View>
    </Card>
  );
}

export const MODE_SUBS = ["Normal listening", "Blocks the room", "Hear the room"];
export const STRENGTHS = [...P.ancLevels.map((l, i) => ({ value: String(i), label: l.name })), { value: "adaptive", label: "Adaptive" }];

/** Off / ANC / Transparency, and the strength under ANC. The flyout's is one compact glass control whose lens glides
 * to the mode; `big`: the settings page's tiles. */
export function NoiseControl({ b, big }: { b: BudPilot; big?: boolean }) {
  const c = useColors();
  const { state, noisePref: pref, adaptive: status } = b;
  if (!state) return null;
  const adaptive = !!pref?.adaptive;
  const ncLevel = pref?.ncLevel ?? ANC_LEVELS[status.current];
  const choose = (p: NoisePref) => void b.setNoise(p);
  const room = status.on ? status.room : undefined;
  const modes = [0, 1, 2].filter((m) => state.ancGains[m]);
  const strength = state.anc === 1 && (
    <Seg
      label="ANC strength"
      testIDPrefix="strength"
      small={!big}
      fit={!big}
      options={STRENGTHS}
      value={adaptive ? "adaptive" : String(status.current)}
      onChange={(v) => choose(v === "adaptive" ? { mode: 1, ncLevel, adaptive: true } : { mode: 1, ncLevel: ANC_LEVELS[Number(v)], adaptive: false })}
    />
  );

  return (
    <View style={s.noise}>
      {/* the flyout's strength sits on the heading line, which is always its height: picking a mode never resizes */}
      {!big && (
        <View style={s.noiseHead}>
          <Txt v="label" style={s.grow}>
            Noise control
          </Txt>
          {strength}
        </View>
      )}
      {big ? (
        <View style={s.tiles} accessibilityRole="radiogroup" aria-label="Noise control">
          {modes.map((m) => (
            <Tile
              key={m}
              testID={`anc-${m}`}
              big
              on={state.anc === m}
              onPress={() => choose(m === 1 ? ancOn() : { mode: m, ncLevel, adaptive })}
              label={modeName(m)}
              sub={MODE_SUBS[m]}
            />
          ))}
        </View>
      ) : (
        <Seg
          label="Noise control"
          testIDPrefix="anc"
          accent
          options={modes.map((m) => ({ value: m, label: modeName(m), icon: (color: string) => <NoiseIcon mode={m} color={color} size={22} /> }))}
          value={state.anc}
          onChange={(m) => choose(m === 1 ? ancOn() : { mode: m, ncLevel, adaptive })}
        />
      )}
      {big && strength}
      {state.anc === 1 && room?.error && (
        <Txt v="sub" style={{ color: c.danger }}>
          {room.error}
        </Txt>
      )}
    </View>
  );
}

/** One pill in a row of choices. */
export type Choice = { key: string; label: string; on: boolean; onPress: () => void };

/** Hoco's EQ presets, the user's saved EQs, then Custom: only while nothing is saved, or while the earbuds play a curve
 * that isn't saved (so the chosen pill always matches what plays). The gaming EQ isn't a pill (its chip sits beside
 * the Game mode switch); picking an EQ here while it plays turns it off and plays the pick. */
export function eqChoices(b: BudPilot): Choice[] {
  const state = b.state!;
  const g = b.game;
  const my = b.myEqs;
  const custom = P.customEqMode;
  const flat = () => P.eqBands.map(() => 0);
  const stored = (mode: number) => state.eqPresets.find((p) => p.mode === mode)?.gains;
  // `curve`: for the Custom slot (saved EQs, Custom)
  const play = (mode: number, gains: number[], curve?: number[]) => (g.eqPlaying ? g.leaveGameEq(mode, curve) : void b.setEq(mode, gains));
  const unsaved = state.eqMode === custom && !my.playing && !g.builtIn; // a Custom curve that isn't a saved EQ
  return [
    ...P.eqPresets.map((p) => ({
      key: `eq-${p.mode}`,
      label: p.name,
      on: !g.builtIn && state.eqMode === p.mode,
      onPress: () => play(p.mode, p.gains ?? stored(p.mode) ?? flat()),
    })),
    ...my.list.map((e) => ({
      key: `eq-my-${e.id}`,
      label: e.name,
      on: my.playing?.id === e.id,
      onPress: () => (g.eqPlaying ? (my.pick(e.id), g.leaveGameEq(custom, e.gains)) : my.play(e)),
    })),
    ...(unsaved || !my.list.length
      ? [{ key: `eq-${custom}`, label: "Custom", on: unsaved, onPress: () => (g.eqPlaying ? g.leaveGameEq(custom, my.customCurve()) : my.playCustom()) }]
      : []),
  ];
}

/** The EQ pills; `onNew`: a "+ New" pill at the end. */
export function EqPills({ b, onNew }: { b: BudPilot; onNew?: () => void }) {
  return (
    <View style={s.pills} accessibilityRole="radiogroup" aria-label="Equalizer">
      {eqChoices(b).map((ch) => (
        <Pill key={ch.key} testID={ch.key} label={ch.label} on={ch.on} onPress={ch.onPress} />
      ))}
      {onNew && <Pill testID="eq-new" label="+ New" on={false} button onPress={onNew} />}
    </View>
  );
}

const STREAKS = [
  { y: 16, w: 0.55, d: 0, t: 3 },
  { y: 34, w: 0.38, d: 60, t: 1.5 },
  { y: 50, w: 0.62, d: 100, t: 3 },
  { y: 66, w: 0.42, d: 160, t: 1.5 },
  { y: 82, w: 0.5, d: 210, t: 3 },
  { y: 25, w: 0.3, d: 280, t: 1.5 },
  { y: 74, w: 0.34, d: 340, t: 1.5 },
];

// Each streak is `w` of the row long and runs from just off its left edge to past its right one: in its own width,
// -110% to 115/w %. Invisible at rest, so with animations off (Windows' "Animation effects") nothing shows.
const streak = StyleSheet.create(
  Object.fromEntries(
    STREAKS.map((k, i) => [
      i,
      css({
        position: "absolute",
        left: 0,
        top: `${k.y}%`,
        width: `${k.w * 100}%`,
        height: k.t,
        borderRadius: 2,
        opacity: 0,
        animationKeyframes: [{ "0%": { transform: "translateX(-110%)", opacity: 0 }, "20%": { opacity: 0.9 }, "100%": { transform: `translateX(${115 / k.w}%)`, opacity: 0 } }],
        animationDuration: "550ms",
        animationDelay: `${k.d}ms`,
        animationTimingFunction: "cubic-bezier(0.3, 0.6, 0.2, 1)",
        animationFillMode: "both",
      }),
    ]),
  ),
);

/** The launch: speed streaks race across the row once. */
function Streaks({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {STREAKS.map((_, i) => (
        <View key={i} style={[streak[i], { backgroundColor: color }]} />
      ))}
    </View>
  );
}

// one chevron of the turbo light: pulses 3 times, a beat after the one before
const pulse = StyleSheet.create(
  Object.fromEntries(
    [0, 150, 300].map((d, i) => [
      i,
      css({
        animationKeyframes: [{ "0%": { opacity: 1 }, "50%": { opacity: 0.25 }, "100%": { opacity: 1 } }],
        animationDuration: "1200ms",
        animationDelay: `${d}ms`,
        animationIterationCount: 3,
        animationTimingFunction: "ease-in-out",
      }),
    ]),
  ),
);

/** ››› next to "Game mode" while it's on: pulses a few times like a turbo light, then stays lit. Never endless:
 * Shono keeps running hidden in the tray, and an endless animation kept the GPU drawing 60 frames a second there
 * (20% of a core). */
function Turbo() {
  const c = useColors();
  return (
    <View style={s.turbo} accessible={false}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={pulse[i]}>
          <ChevronIcon color={c.signalInk} />
        </View>
      ))}
    </View>
  );
}

/** The Game mode switch; turning it on (by hand or by a full-screen game) launches with a short speed burst. `chip`:
 * the flyout's gaming EQ toggle beside the switch while Game mode is on, named after the EQ it plays (the built-in
 * Game EQ unless Settings chose another), so no row is added. */
export function GameRow({ b, chip }: { b: BudPilot; chip?: boolean }) {
  const c = useColors();
  const { active: on, byGame, prefs, setOn, gameEqName, setEqOn } = b.game;
  const [burst, setBurst] = useState(0);
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current) setBurst((n) => n + 1);
    was.current = on;
  }, [on]);
  const status = byGame
    ? "On while full screen"
    : prefs.manual
      ? "On: lowest delay"
      : prefs.auto && canDetectGames()
        ? "Turns on by itself for full-screen games"
        : "Lowest audio delay, for games and videos";

  return (
    <View style={s.gameRow}>
      {burst > 0 && <Streaks key={burst} color={c.signal} />}
      <View style={s.row}>
        <View style={s.grow}>
          <View style={s.inline}>
            <Txt v="title">Game mode</Txt>
            {on && <Turbo />}
          </View>
          <Txt v="sub" numberOfLines={1}>
            {status}
          </Txt>
        </View>
        {chip && on && (
          <Pressable
            testID="game-eq"
            accessibilityRole="switch"
            aria-checked={prefs.eqOn}
            accessibilityLabel={`${gameEqName} while gaming`}
            onPress={() => setEqOn(!prefs.eqOn)}
            hitSlop={6}
            style={(state) => [s.chip, s.gameEqChip, controlStyle((hover) => pillLook(c, prefs.eqOn, hover))(state)]}
          >
            <Text numberOfLines={1} style={[s.chipText, prefs.eqOn && s.chipStrong, { color: prefs.eqOn ? c.onInk : c.ink }]}>
              {gameEqName}
            </Text>
          </Pressable>
        )}
        <Switch testID="game" value={on} onChange={setOn} label="Game mode" />
      </View>
    </View>
  );
}

/** The last command's error (a change the earbuds refused or didn't keep), where both views can show it. */
export function ErrorNote({ b }: { b: BudPilot }) {
  const c = useColors();
  if (!b.error) return null;
  return (
    <View accessibilityRole="alert" style={[s.error, { backgroundColor: c.card, borderColor: c.danger }]}>
      <Dot color={c.danger} />
      <Txt v="small" style={[s.grow, { color: c.danger }]}>
        {b.error}
      </Txt>
    </View>
  );
}

/** Which EQ the gaming EQ plays: the built-in Game EQ, a preset or a saved EQ. */
export function gameEqChoices(b: BudPilot): Choice[] {
  const { choice, setGameEq } = b.game;
  return [
    { key: "game-eq-builtin", label: GAME_EQ_NAME, on: choice.kind === "builtin", onPress: () => setGameEq({ kind: "builtin" }) },
    ...P.eqPresets.map((p) => ({
      key: `game-eq-${p.mode}`,
      label: p.name,
      on: choice.kind === "preset" && choice.mode === p.mode,
      onPress: () => setGameEq({ kind: "preset", mode: p.mode }),
    })),
    ...b.myEqs.list.map((e) => ({
      key: `game-eq-my-${e.id}`,
      label: e.name,
      on: choice.kind === "mine" && choice.id === e.id,
      onPress: () => setGameEq({ kind: "mine", id: e.id }),
    })),
  ];
}

/** The gaming EQ picker, for Settings. */
export function GameEqPicker({ b }: { b: BudPilot }) {
  return (
    <View style={s.pills} accessibilityRole="radiogroup" aria-label="Gaming EQ plays">
      {gameEqChoices(b).map((ch) => (
        <Pill key={ch.key} testID={ch.key} label={ch.label} on={ch.on} onPress={ch.onPress} />
      ))}
    </View>
  );
}

/** Not connected, or waiting for the earbuds to come back. */
export function ConnectState({ b }: { b: BudPilot }) {
  const c = useColors();
  const waiting = b.status === "reconnecting";
  return (
    <Card>
      <View style={s.row}>
        <View style={[s.glyph, { backgroundColor: c.well }]}>
          <BudIcon color={c.ink2} size={20} />
        </View>
        <View style={s.grow}>
          <Txt v="name">{waiting ? "Waiting for your earbuds" : "Not connected"}</Txt>
          <View style={s.inline}>
            <Dot color={c.ink2} size={6} />
            <Txt v="sub">
              {waiting
                ? b.pcLinked
                  ? "Connected to Windows, not answering Shono"
                  : "In the case or out of range"
                : b.status === "connecting"
                  ? "Connecting…"
                  : "Shono isn't connected"}
            </Txt>
          </View>
        </View>
      </View>
      <Txt v="small" muted>
        {waiting
          ? b.pcLinked
            ? "Sound isn't affected. Shono keeps trying by itself."
            : "Open the case. Shono connects by itself."
          : "Open the case, then connect. Close other apps that control them first."}
      </Txt>
      {!waiting && (
        <Button
          primary
          testID="connect"
          label={b.status === "connecting" ? "Connecting…" : "Connect earbuds"}
          onPress={b.status === "idle" ? () => void b.connect() : undefined}
        />
      )}
      {b.error && (
        <Txt v="sub" style={{ color: c.danger }}>
          {b.error}
        </Txt>
      )}
    </Card>
  );
}

export const CREDIT_NAME = "wahidalways";
const LINKS = [
  { label: `${CREDIT_NAME} on X`, url: "https://x.com/mrbrainaxes", Logo: XLogo },
  { label: `${CREDIT_NAME} on GitHub`, url: "https://github.com/wahidalways", Logo: GitHubLogo },
];

/** "Made by wahidalways", then X and GitHub as small glass chips (as in Muse). */
export function Credit() {
  const c = useColors();
  return (
    <View style={s.inline}>
      <Txt v="small" muted>
        Made by <Text style={{ color: c.ink, fontFamily: F.semibold }}>{CREDIT_NAME}</Text>
      </Txt>
      <View style={[s.divider, { backgroundColor: c.hair }]} />
      {LINKS.map(({ label, url, Logo }) => (
        <Pressable
          key={url}
          accessibilityRole="link"
          accessibilityLabel={label}
          accessibilityHint="Opens in your browser"
          onPress={() => void Linking.openURL(url).catch(() => undefined)} // no browser is rare; nothing useful to show
          style={(state) => [s.creditChip, controlStyle((hover) => ({ backgroundColor: hover ? c.hover : c.card, borderColor: c.stroke, boxShadow: `${c.shine}, ${c.drop}` }))(state)]}
        >
          <Logo color={c.ink} />
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  chip: css({
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 1,
    minWidth: 0,
    transitionProperty: "background-color",
    transitionDuration: "300ms",
  }),
  chipText: { fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  chipStrong: { fontFamily: F.semibold },
  gameEqChip: { borderWidth: 1, flexShrink: 1, maxWidth: 130 },
  device: { paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  batteries: { flexDirection: "row", gap: 14 },
  battery: { flex: 1, gap: 3 },
  photoBox: { height: 62, alignItems: "center", justifyContent: "flex-start", marginBottom: 2 },
  photo: { height: 54 },
  // a soft oval under the photo, as if it stood on the card
  shadow: { position: "absolute", bottom: 1, width: 30, height: 4, borderRadius: 999, opacity: 0.16, filter: "blur(2px)" },
  photoGone: { opacity: 0.3 },
  pct: { fontFamily: F.semibold, fontSize: 20, lineHeight: 24, fontVariant: ["tabular-nums"], letterSpacing: -0.3 },
  pctSign: { fontFamily: F.medium, fontSize: 12 },
  cell: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  cellBody: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  cellFill: css({ height: "100%", borderRadius: 4, transitionProperty: "width", transitionDuration: "700ms", transitionTimingFunction: "ease-out" }),
  cellCap: { width: 3, height: 4, borderRadius: 1.5 },
  batteryLabel: { fontSize: 11 },
  noise: { gap: 10 },
  noiseHead: { flexDirection: "row", alignItems: "center", gap: 8, height: 28 }, // 28: the small strength control
  tiles: { flexDirection: "row", gap: 8 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  turbo: { flexDirection: "row", alignItems: "center", gap: 1, marginLeft: 2 },
  gameRow: { overflow: "hidden", borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12, marginHorizontal: -12, marginVertical: -6 },
  glyph: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  divider: { width: 1, height: 16, marginHorizontal: 4 },
  creditChip: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
