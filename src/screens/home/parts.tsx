// Pieces both views share: the tray flyout and the settings window.
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { ANC_LEVELS } from "@/hooks/use-adaptive-anc";
import type { NoisePref } from "@/hooks/use-earbuds";
import { canDetectGames } from "@/hooks/use-game-mode";
import type { Battery as BatteryLevel } from "@/jieli/earbuds";
import { F, useColors } from "@/theme";
import { BoltIcon, BudIcon, ChevronIcon, GitHubLogo, NoiseIcon, XLogo } from "@/ui/icons";
import { Button, Card, Dot, Pill, pillLook, Seg, Switch, Tile, ToggleRow, Txt } from "@/ui/kit";
import { nearestIndex } from "@/utils/adaptive-anc";
import { type Correction, seconds } from "@/utils/corrections";

import { type BudPilot, modeName } from "./use-bud-pilot";

const levelName = (level: number) => P.ancLevels[nearestIndex(level, ANC_LEVELS)]?.name ?? "";

/** What BudPilot is holding, in a few words: "Off", "ANC Mid", "ANC Adaptive". */
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

/** "Keeping Off" chip; flashes "Undid ANC 0.12 s" right after a put-back. Short and fixed-length, so it never widens the flyout. */
export function KeepChip({ b }: { b: BudPilot }) {
  const c = useColors();
  const just = useJustCorrected(b.corrections);
  if (!b.keep || !b.noisePref) return null;
  const putting = b.putting;
  const loud = !!just && !putting;
  const [lead, strong, tail] = putting
    ? ["Putting ", modeName(putting.to), " back"]
    : just
      ? [`Undid ${modeName(just.from)} `, seconds(just.ms), ""]
      : ["Keeping ", keepText(b.noisePref), ""];
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

function Battery({ label, level }: { label: string; level: BatteryLevel }) {
  const c = useColors();
  return (
    <View
      style={s.battery}
      accessible
      accessibilityLabel={`${label} battery ${level ? `${level.percent} percent${level.charging ? ", charging" : ""}` : "not available"}`}
    >
      <View style={s.inline}>
        <Txt v="sub" style={s.batteryLabel}>
          {label}
        </Txt>
        {level?.charging && <BoltIcon color={c.ok} />}
      </View>
      <Txt v="num">{level ? `${level.percent}%` : "—"}</Txt>
      <View style={[s.meter, { backgroundColor: c.well }]}>
        <View style={[s.meterFill, { width: `${level?.percent ?? 0}%`, backgroundColor: level?.charging ? c.ok : c.ink2 }]} />
      </View>
    </View>
  );
}

/** Name, connection, and the three batteries, in one card. */
export function DeviceCard({ b }: { b: BudPilot }) {
  const c = useColors();
  const bat = b.state!.battery;
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
        <Battery label="Left" level={bat.left} />
        <Battery label="Right" level={bat.right} />
        <Battery label="Case" level={bat.case} />
      </View>
    </Card>
  );
}

const MODE_SUBS = ["Normal listening", "Blocks the room", "Hear the room"];
const STRENGTHS = [...P.ancLevels.map((l, i) => ({ value: String(i), label: l.name })), { value: "adaptive", label: "Adaptive" }];

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
              onPress={() => choose({ mode: m, ncLevel, adaptive })}
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
          onChange={(m) => choose({ mode: m, ncLevel, adaptive })}
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

/** Hoco's EQ presets, then Custom. While Game mode plays the Footsteps EQ, it takes Custom's place (it borrows the
 * Custom slot, so showing "Custom" would be wrong) and the row keeps its size; picking a preset leaves Footsteps. */
export function EqPills({ b, gains }: { b: BudPilot; gains?: number[] }) {
  const state = b.state!;
  const footsteps = b.game.footsteps;
  const flat = () => P.eqBands.map(() => 0);
  const stored = (mode: number) => state.eqPresets.find((p) => p.mode === mode)?.gains;
  const set = (mode: number, g: number[]) => (footsteps ? b.game.leaveFootsteps(mode) : void b.run((e) => e.setEq(mode, g))());
  return (
    <View style={s.pills} accessibilityRole="radiogroup" aria-label="Equalizer">
      {P.eqPresets.map((p) => (
        <Pill
          key={p.name}
          testID={`eq-${p.mode}`}
          label={p.name}
          on={!footsteps && state.eqMode === p.mode}
          onPress={() => set(p.mode, p.gains ?? stored(p.mode) ?? flat())}
        />
      ))}
      {footsteps ? (
        <Pill testID="eq-footsteps" label="Footsteps" on onPress={() => {}} />
      ) : (
        <Pill
          testID={`eq-${P.customEqMode}`}
          label="Custom"
          on={state.eqMode === P.customEqMode}
          onPress={() => set(P.customEqMode, gains ?? stored(P.customEqMode) ?? flat())}
        />
      )}
    </View>
  );
}

const STREAK_EASE = cubicBezier(0.3, 0.6, 0.2, 1);
const STREAKS = [
  { y: 16, w: 0.55, d: 0, t: 3 },
  { y: 34, w: 0.38, d: 60, t: 1.5 },
  { y: 50, w: 0.62, d: 100, t: 3 },
  { y: 66, w: 0.42, d: 160, t: 1.5 },
  { y: 82, w: 0.5, d: 210, t: 3 },
  { y: 25, w: 0.3, d: 280, t: 1.5 },
  { y: 74, w: 0.34, d: 340, t: 1.5 },
];

/** The launch: speed streaks race across the row once. */
function Streaks({ width, color }: { width: number; color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {STREAKS.map((k, i) => {
        const len = width * k.w;
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: `${k.y}%`,
              width: len,
              height: k.t,
              borderRadius: 2,
              backgroundColor: color,
              animationName: {
                from: { transform: [{ translateX: -len * 1.1 }], opacity: 0 },
                "20%": { opacity: 0.9 },
                to: { transform: [{ translateX: width * 1.15 }], opacity: 0 },
              },
              animationDuration: 550,
              animationDelay: k.d,
              animationTimingFunction: STREAK_EASE,
              animationFillMode: "both",
            }}
          />
        );
      })}
    </View>
  );
}

/** ››› next to "Game mode" while it's on, pulsing like a turbo light (still when motion is reduced). */
function Turbo({ still }: { still: boolean }) {
  const c = useColors();
  return (
    <View style={s.turbo} accessible={false}>
      {[0, 150, 300].map((d) => (
        <Animated.View
          key={d}
          style={
            !still && {
              animationName: { "0%": { opacity: 0.25 }, "40%": { opacity: 1 }, "100%": { opacity: 0.25 } },
              animationDuration: 1200,
              animationDelay: d,
              animationIterationCount: "infinite",
              animationTimingFunction: "ease-in-out",
            }
          }
        >
          <ChevronIcon color={c.signalInk} />
        </Animated.View>
      ))}
    </View>
  );
}

/** The Game mode switch; turning it on (by hand or by a full-screen game) launches with a short speed burst.
 * `footsteps`: the flyout's small Footsteps EQ toggle beside the switch while Game mode is on, so no row is added. */
export function GameRow({ b, footsteps }: { b: BudPilot; footsteps?: boolean }) {
  const c = useColors();
  const still = useReducedMotion();
  const { active: on, byGame, prefs, setOn } = b.game;
  const [burst, setBurst] = useState(0);
  const [width, setWidth] = useState(0);
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current && !still) setBurst((n) => n + 1);
    was.current = on;
  }, [on, still]);
  const status = byGame
    ? "On while full screen"
    : prefs.manual
      ? "On: lowest delay"
      : prefs.auto && canDetectGames()
        ? "Turns on by itself for full-screen games"
        : "Lowest audio delay, for games and videos";

  return (
    <View style={s.gameRow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {burst > 0 && width > 0 && <Streaks key={burst} width={width} color={c.signal} />}
      <View style={s.row}>
        <View style={s.grow}>
          <View style={s.inline}>
            <Txt v="title">Game mode</Txt>
            {on && <Turbo still={still} />}
          </View>
          <Txt v="sub" numberOfLines={1}>
            {status}
          </Txt>
        </View>
        {footsteps && on && (
          <Pressable
            testID="footsteps"
            accessibilityRole="switch"
            aria-checked={prefs.eq}
            accessibilityLabel="Footsteps EQ: less boom, clearer footsteps"
            onPress={() => b.game.update({ eq: !prefs.eq })}
            hitSlop={6}
            style={({ pressed }) => [s.chip, s.footstepsChip, pillLook(c, prefs.eq), pressed && s.pressed]}
          >
            <Text style={[s.chipText, prefs.eq && s.chipStrong, { color: prefs.eq ? c.onInk : c.ink }]}>Footsteps EQ</Text>
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

/** Footsteps EQ on/off: Game mode plays it while it's on. */
export function FootstepsToggle({ b }: { b: BudPilot }) {
  return (
    <ToggleRow
      testID="footsteps"
      title="Footsteps EQ"
      detail="Less boom, clearer footsteps. Your EQ comes back after."
      value={b.game.prefs.eq}
      onChange={(eq) => b.game.update({ eq })}
    />
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
                  ? "Connected to Windows, not answering BudPilot"
                  : "In the case or out of range"
                : b.status === "connecting"
                  ? "Connecting…"
                  : "BudPilot isn't connected"}
            </Txt>
          </View>
        </View>
      </View>
      <Txt v="small" muted>
        {waiting
          ? b.pcLinked
            ? "Sound isn't affected. BudPilot keeps trying by itself."
            : "Open the case. BudPilot connects by itself."
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
          style={({ pressed }) => [s.creditChip, { backgroundColor: c.card, borderColor: c.stroke, boxShadow: `${c.shine}, ${c.drop}` }, pressed && s.pressed]}
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
  pressed: { transform: [{ scale: 0.94 }] },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexShrink: 1, minWidth: 0 },
  chipText: { fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  chipStrong: { fontFamily: F.semibold },
  device: { paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  batteries: { flexDirection: "row", gap: 14 },
  battery: { flex: 1, gap: 4 },
  batteryLabel: { fontSize: 11 },
  meter: { height: 4, borderRadius: 2, overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 2 },
  noise: { gap: 10 },
  noiseHead: { flexDirection: "row", alignItems: "center", gap: 8, height: 28 }, // 28: the small strength control
  tiles: { flexDirection: "row", gap: 8 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  footstepsChip: { borderWidth: 1, flexShrink: 0 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  turbo: { flexDirection: "row", alignItems: "center", gap: 1, marginLeft: 2 },
  gameRow: { overflow: "hidden", borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12, marginHorizontal: -12, marginVertical: -6 },
  glyph: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  divider: { width: 1, height: 16, marginHorizontal: 4 },
  creditChip: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
