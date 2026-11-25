// The latency check on a phone (Windows' is screens/home/latency-check.tsx, on Web Audio): six beeps at random
// moments, a tap at each; the median tap time with Game mode off and then on shows what Game mode saves. The phone's
// own audio delay and your reaction time are in both runs, so their difference is the earbuds'.
import Ionicons from "@expo/vector-icons/Ionicons";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { F, useColors } from "@/theme";
import { latencyMs } from "@/utils/game";
import { sleep } from "@/utils/later";

import { Press, T, tick, Txt } from "./kit";

const BEEPS = 6;
const BEEP = require("../../assets/sounds/beep.wav");
type Results = { normal?: number | null; game?: number | null }; // null: not enough taps

export function LatencyCheck({ gameOn }: { gameOn: boolean }) {
  const c = useColors();
  const player = useAudioPlayer(BEEP);
  const [beep, setBeep] = useState(0); // 0 = not running
  const [results, setResults] = useState<Results>({});
  const tap = useRef<() => void>(undefined);
  // music playing meanwhile dips for a beep instead of stopping
  useEffect(() => void setAudioModeAsync({ interruptionMode: "duckOthers" }).catch(() => {}), []);
  // closed mid-check (a tablet's Game card folded, the tablet turned): the check stops, since the beep's player is gone
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      tap.current?.(); // ends a wait for a tap
    };
  }, []);

  const start = async () => {
    const mode = gameOn ? "game" : "normal";
    const samples: number[] = [];
    try {
      for (let i = 1; i <= BEEPS; i++) {
        setBeep(i);
        await sleep(1200 + Math.random() * 1300); // a random gap, so taps can't be timed by rhythm
        if (gone.current) return;
        await player.seekTo(0);
        player.play();
        const playedAt = performance.now();
        const tappedAt = await new Promise<number>((resolve) => {
          const missed = setTimeout(() => resolve(Infinity), 1600);
          tap.current = () => {
            clearTimeout(missed);
            resolve(performance.now());
          };
        });
        tap.current = undefined;
        if (gone.current) return;
        samples.push(tappedAt - playedAt);
      }
    } finally {
      tap.current = undefined;
      setBeep(0);
    }
    setResults((r) => ({ ...r, [mode]: latencyMs(samples) ?? null }));
  };

  const { normal, game } = results;
  const diff = typeof normal === "number" && typeof game === "number" ? normal - game : undefined;

  return (
    <View style={s.wrap}>
      <Txt v="sub">Tap the button the moment you hear each beep. Do it once with Game mode off, then on.</Txt>
      <Press
        accessibilityRole="button"
        accessibilityLabel={beep ? `Tap when you hear beep ${beep} of ${BEEPS}` : `Start the latency check with Game mode ${gameOn ? "on" : "off"}`}
        // a tap counts when the finger lands, not when it lifts (that would add 50-100 ms of noise)
        onPressIn={beep ? () => tap.current?.() : undefined}
        onPress={
          beep
            ? undefined
            : () => {
                tick();
                void start();
              }
        }
        scale={0.97}
        style={[s.button, { backgroundColor: beep ? c.signalFill : c.well }]}
      >
        <Ionicons name={beep ? "ear" : "pulse"} size={20} color={beep ? c.onSignal : c.signalInk} />
        <Text style={[T.strong, { fontFamily: F.semibold, color: beep ? c.onSignal : c.ink }]}>
          {beep ? `Tap when you hear it (${beep}/${BEEPS})` : `Start check (Game mode ${gameOn ? "on" : "off"})`}
        </Text>
      </Press>
      <View style={s.results}>
        <Stat label="Normal" v={normal} next={!gameOn} />
        <Stat label="Game mode" v={game} next={gameOn} />
      </View>
      {diff !== undefined && (
        <Txt v="strong" style={{ color: diff > 0 ? c.ok : c.ink }}>
          {diff > 0 ? `Game mode is about ${Math.round(diff)} ms quicker on your earbuds.` : "No clear difference this time; try both again."}
        </Txt>
      )}
    </View>
  );
}

/** One run's result, big: the median tap time, or a dash until it's checked. `next`: the one a check now fills (it
 * follows Game mode), edged in the accent. */
function Stat({ label, v, next }: { label: string; v?: number | null; next: boolean }) {
  const c = useColors();
  return (
    <View style={[s.stat, { backgroundColor: c.well, borderColor: next ? c.tintEdge : "transparent" }]}>
      <Txt v="small" muted>
        {label}
      </Txt>
      {typeof v === "number" ? (
        <Text style={[s.num, { color: c.ink }]}>
          {Math.round(v)}
          <Text style={[s.unit, { color: c.ink2 }]}> ms</Text>
        </Text>
      ) : (
        <Text style={[s.num, { color: c.ink2 }, v === null && s.few]}>{v === null ? "Too few taps" : "—"}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12 },
  button: { height: 64, borderRadius: 18, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  results: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  num: { fontFamily: F.display, fontSize: 24, lineHeight: 30, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: F.medium, fontSize: 13 },
  few: { fontFamily: F.semibold, fontSize: 14 },
});
