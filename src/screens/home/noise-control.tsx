import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import type { NoisePref } from "@/hooks/use-earbuds";
import { useRoomLoudness } from "@/hooks/use-room-loudness";
import type { EarbudsState } from "@/jieli/earbuds";
import type { Colors } from "@/theme";
import { MIN_HOLD_MS, nearestIndex, pickStrength, roomWord } from "@/utils/adaptive-anc";

import { Card, cardStyles } from "./card";
import { Segmented } from "./segmented";

type Props = {
  c: Colors;
  state: EarbudsState;
  pref?: NoisePref;
  /** The user's choice: saved, applied, and put back if the earbuds change it by themselves. */
  onChoose: (p: NoisePref) => void;
  /** Adaptive's own strength changes; they don't change the saved choice. */
  onAutoLevel: (level: number) => void;
};

const MODES = [
  { value: 0, label: "Off", hint: "Normal listening." },
  { value: 1, label: "Noise cancelling", hint: "Blocks out the sound around you." },
  { value: 2, label: "Transparency", hint: "Lets you hear what's around you." },
];
const LEVELS = P.ancLevels.map((l) => l.level);
const STRENGTHS = [...P.ancLevels.map((l, i) => ({ value: String(i), label: l.name })), { value: "adaptive", label: "Adaptive" }];

export function NoiseControlCard({ c, state, pref, onChoose, onAutoLevel }: Props) {
  const cancelling = state.anc === 1;
  const adaptive = !!pref?.adaptive;
  const current = nearestIndex(state.ancLevel ?? 1, LEVELS);
  const room = useRoomLoudness(cancelling && adaptive);
  const lastChange = useRef(0);

  // Adaptive: follow the room, at most one change per MIN_HOLD_MS
  useEffect(() => {
    if (!cancelling || !adaptive || room.db === undefined) return;
    const next = pickStrength(room.db, current);
    if (next === current || Date.now() - lastChange.current < MIN_HOLD_MS) return;
    lastChange.current = Date.now();
    onAutoLevel(LEVELS[next]);
  }, [cancelling, adaptive, room.db, current, onAutoLevel]);

  const ncLevel = pref?.ncLevel ?? LEVELS[current];
  const chooseMode = (mode: number) => onChoose({ mode, ncLevel, adaptive });
  const chooseStrength = (v: string) => {
    lastChange.current = 0; // Adaptive may act on its first reading
    onChoose(v === "adaptive" ? { mode: 1, ncLevel, adaptive: true } : { mode: 1, ncLevel: LEVELS[Number(v)], adaptive: false });
  };

  return (
    <Card c={c} title="Noise control">
      <Segmented c={c} options={MODES.filter((m) => state.ancGains[m.value])} value={state.anc} onChange={chooseMode} testIDPrefix="anc" />
      <Text style={[cardStyles.hint, { color: c.muted }]}>{MODES.find((m) => m.value === state.anc)?.hint}</Text>

      {cancelling && (
        <View style={s.strength}>
          <Text style={[s.label, { color: c.text }]}>Strength</Text>
          <Segmented c={c} options={STRENGTHS} value={adaptive ? "adaptive" : String(current)} onChange={chooseStrength} testIDPrefix="strength" />
          {adaptive &&
            (room.error ? (
              <Text style={[cardStyles.hint, { color: c.danger }]}>{room.error}</Text>
            ) : (
              <View>
                <Text style={[cardStyles.hint, { color: c.text }]}>
                  {room.db === undefined ? "Listening to the room…" : `${P.ancLevels[current].name} now: ${roomWord(room.db)} around you`}
                </Text>
                <Text style={[s.fine, { color: c.muted }]}>
                  Uses {room.mic ?? "your computer's microphone"} for loudness only. Nothing is recorded.
                </Text>
              </View>
            ))}
        </View>
      )}
      {pref && <Text style={[s.fine, { color: c.muted }]}>BudPilot remembers this and puts it back if the earbuds change it by themselves.</Text>}
    </Card>
  );
}

const s = StyleSheet.create({
  strength: { gap: 8, paddingTop: 4 },
  label: { fontSize: 14, fontWeight: "600" },
  fine: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
