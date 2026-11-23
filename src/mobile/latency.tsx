// The latency check on a phone (Windows' is screens/home/latency-check.tsx, on Web Audio): six beeps at random
// moments, a tap at each; the median tap time with Game mode off and then on shows what Game mode saves. The phone's
// own audio delay and your reaction time are in both runs, so their difference is the earbuds'.
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

  const start = async () => {
    const mode = gameOn ? "game" : "normal";
    const samples: number[] = [];
    try {
      for (let i = 1; i <= BEEPS; i++) {
        setBeep(i);
        await sleep(1200 + Math.random() * 1300); // a random gap, so taps can't be timed by rhythm
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
        samples.push(tappedAt - playedAt);
      }
    } finally {
      tap.current = undefined;
      setBeep(0);
    }
    setResults((r) => ({ ...r, [mode]: latencyMs(samples) ?? null }));
  };

  const show = (v?: number | null) => (v === undefined ? "not checked" : v === null ? "not enough taps" : `${Math.round(v)} ms`);
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
        <Text style={[T.strong, { fontFamily: F.semibold, color: beep ? c.onSignal : c.ink }]}>
          {beep ? `Tap when you hear it (${beep}/${BEEPS})` : `Start check (Game mode ${gameOn ? "on" : "off"})`}
        </Text>
      </Press>
      <View style={s.results}>
        <Txt v="small" muted>
          Normal <Text style={[s.num, { color: c.ink }]}>{show(normal)}</Text>
        </Txt>
        <Txt v="small" muted>
          Game mode <Text style={[s.num, { color: c.ink }]}>{show(game)}</Text>
        </Txt>
      </View>
      {diff !== undefined && (
        <Txt v="strong" style={{ color: diff > 0 ? c.ok : c.ink }}>
          {diff > 0 ? `Game mode is about ${Math.round(diff)} ms quicker on your earbuds.` : "No clear difference this time; try both again."}
        </Txt>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  button: { height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  results: { flexDirection: "row", gap: 24 },
  num: { fontFamily: F.semibold, fontVariant: ["tabular-nums"] },
});
