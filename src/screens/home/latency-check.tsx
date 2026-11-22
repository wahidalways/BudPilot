import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Colors } from "@/theme";
import { latencyMs } from "@/utils/game";

import { cardStyles } from "./card";

const BEEPS = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Results = { normal?: number | null; game?: number | null }; // null: not enough taps

/** Beeps at random moments; the user taps when they hear each one. Normal vs Game mode shows the difference. */
export function LatencyCheck({ c, gameOn }: { c: Colors; gameOn: boolean }) {
  const [beep, setBeep] = useState(0); // 0 = not running
  const [results, setResults] = useState<Results>({});
  const tap = useRef<() => void>(undefined);

  // Space works as the tap button during a run
  useEffect(() => {
    if (!beep || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      tap.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [beep]);

  if (typeof AudioContext === "undefined") return null; // no Web Audio (e.g. native for now)

  const start = async () => {
    const mode = gameOn ? "game" : "normal";
    const ctx = new AudioContext();
    const samples: number[] = [];
    try {
      for (let i = 1; i <= BEEPS; i++) {
        setBeep(i);
        await sleep(1200 + Math.random() * 1300); // a random gap, so taps can't be timed by rhythm
        const at = ctx.currentTime + 0.05;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.35, at + 0.005);
        gain.gain.linearRampToValueAtTime(0, at + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.1);
        const playedAt = performance.now() + 50;
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
      void ctx.close();
    }
    setResults((r) => ({ ...r, [mode]: latencyMs(samples) ?? null }));
  };

  const show = (v?: number | null) => (v === undefined ? "not checked" : v === null ? "not enough taps" : `${Math.round(v)} ms`);
  const { normal, game } = results;
  const diff = typeof normal === "number" && typeof game === "number" ? normal - game : undefined;

  return (
    <View style={s.wrap}>
      <Text style={[cardStyles.hint, { color: c.muted }]}>
        Make sure the earbuds are this computer&apos;s sound output. Tap the button, or press Space, as soon as you hear each beep. Run it
        once with Game mode off and once with it on.
      </Text>
      <Pressable
        testID="latency"
        accessibilityRole="button"
        accessibilityLabel={beep ? `Tap when you hear beep ${beep} of ${BEEPS}` : `Start the latency check with Game mode ${gameOn ? "on" : "off"}`}
        onPress={beep ? () => tap.current?.() : () => void start()}
        style={({ pressed }) => [
          s.button,
          beep ? { backgroundColor: c.accent } : { borderColor: c.border, borderWidth: 1 },
          { opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[s.buttonText, { color: beep ? c.onAccent : c.text }]}>
          {beep ? `Tap when you hear it (${beep}/${BEEPS})` : `Start check (Game mode ${gameOn ? "on" : "off"})`}
        </Text>
      </Pressable>
      <View style={s.results}>
        <Text style={{ color: c.text }}>Normal: {show(normal)}</Text>
        <Text style={{ color: c.text }}>Game mode: {show(game)}</Text>
      </View>
      {diff !== undefined && (
        <Text style={[cardStyles.hint, { color: c.text }]}>
          {diff > 0 ? `Game mode is about ${Math.round(diff)} ms quicker.` : "No clear difference this time; try both again."} Your reaction time is in
          both numbers, so only the difference counts.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  buttonText: { fontSize: 15, fontWeight: "600" },
  results: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
