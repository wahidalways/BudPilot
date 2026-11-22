import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import type { EarbudsState } from "@/jieli/earbuds";
import type { Colors } from "@/theme";

import { Card, cardStyles } from "./card";
import { VerticalSlider } from "./vertical-slider";

type Props = { c: Colors; state: EarbudsState; onSet: (mode: number, gains: number[]) => Promise<void> };

const flat = () => P.eqBands.map(() => 0);
const withBand = (gains: number[], i: number, v: number) => P.eqBands.map((_, j) => (j === i ? v : (gains[j] ?? 0)));

/** Hoco's named presets, then Custom. The sliders always show your saved Custom (flat until you change it); moving one selects and saves it. */
export function EqualizerCard({ c, state, onSet }: Props) {
  const [draft, setDraft] = useState<number[]>(); // what a drag shows before the earbuds confirm
  const custom = P.customEqMode;
  const customOn = state.eqMode === custom;
  const stored = (mode: number) => state.eqPresets.find((p) => p.mode === mode)?.gains;
  const gains = draft ?? (customOn ? state.eqGains : (stored(custom) ?? flat()));
  const isFlat = gains.every((g) => g === 0);

  const saveCustom = (next: number[]) => {
    setDraft(next);
    void onSet(custom, next).finally(() => setDraft(undefined));
  };

  return (
    <>
      {P.eqPresets.length > 0 && (
        <Card c={c} title="Presets">
          <View style={s.grid}>
            {P.eqPresets.map((p) => {
              const g = p.gains ?? stored(p.mode) ?? flat();
              const on = state.eqMode === p.mode;
              return (
                <Pressable
                  key={p.name}
                  accessibilityRole="radio"
                  aria-checked={on}
                  accessibilityLabel={p.name}
                  onPress={on ? undefined : () => void onSet(p.mode, g)}
                  style={({ pressed }) => [
                    s.tile,
                    { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accentSoft : pressed ? c.sunken : "transparent" },
                  ]}
                >
                  <Text style={[s.tileText, { color: on ? c.text : c.muted, fontWeight: on ? "600" : "400" }]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      <Card
        c={c}
        title="Custom"
        action={
          <View style={s.actions}>
            {customOn && !isFlat && (
              <Pressable
                accessibilityRole="button"
                onPress={() => saveCustom(flat())}
                style={({ pressed }) => [cardStyles.smallButton, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: c.text }}>Reset</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="radio"
              aria-checked={customOn}
              accessibilityLabel="Use Custom"
              onPress={customOn ? undefined : () => void onSet(custom, gains)}
              hitSlop={8}
              style={[s.radio, { borderColor: customOn ? c.accent : c.border }]}
            >
              {customOn && <View style={[s.dot, { backgroundColor: c.accent }]} />}
            </Pressable>
          </View>
        }
      >
        <View style={[s.sliders, !customOn && !draft && s.inactive]}>
          {P.eqBands.map((band, i) => (
            <VerticalSlider
              key={band}
              c={c}
              label={band}
              value={gains[i] ?? 0}
              max={P.eqMax}
              onChange={(v) => setDraft(withBand(gains, i, v))}
              onCommit={(v) => saveCustom(withBand(gains, i, v))}
            />
          ))}
        </View>
        <Text style={[cardStyles.hint, { color: c.muted }]}>
          {customOn ? "Your own sound. Changes are saved on the earbuds." : "Your own sound. Move a slider to switch to it."}
        </Text>
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "40%", flexGrow: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center" },
  tileText: { fontSize: 14, textAlign: "center" },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dot: { width: 11, height: 11, borderRadius: 6 },
  sliders: { flexDirection: "row", gap: 2, paddingTop: 4 },
  inactive: { opacity: 0.45 },
});
