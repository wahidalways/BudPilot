import { StyleSheet, Text } from "react-native";

import { ANC_LEVELS, type AdaptiveStatus } from "@/hooks/use-adaptive-anc";
import type { NoisePref } from "@/hooks/use-earbuds";
import type { EarbudsState } from "@/jieli/earbuds";
import type { Colors } from "@/theme";

import { Card, cardStyles } from "./card";
import { Segmented } from "./segmented";
import { StrengthPicker } from "./strength-picker";

type Props = {
  c: Colors;
  state: EarbudsState;
  pref?: NoisePref;
  /** The user's choice: saved, applied, and put back if the earbuds change it by themselves. */
  onChoose: (p: NoisePref) => void;
  /** Adaptive's live status (it runs app-wide). */
  status: AdaptiveStatus;
};

const MODES = [
  { value: 0, label: "Off", hint: "Normal listening." },
  { value: 1, label: "Noise cancelling", hint: "Blocks out the sound around you." },
  { value: 2, label: "Transparency", hint: "Lets you hear what's around you." },
];

export function NoiseControlCard({ c, state, pref, onChoose, status }: Props) {
  const cancelling = state.anc === 1;
  const adaptive = !!pref?.adaptive;
  const ncLevel = pref?.ncLevel ?? ANC_LEVELS[status.current];

  return (
    <Card c={c} title="Noise control">
      <Segmented
        c={c}
        options={MODES.filter((m) => state.ancGains[m.value])}
        value={state.anc}
        onChange={(mode) => onChoose({ mode, ncLevel, adaptive })}
        testIDPrefix="anc"
      />
      <Text style={[cardStyles.hint, { color: c.muted }]}>{MODES.find((m) => m.value === state.anc)?.hint}</Text>

      {cancelling && (
        <StrengthPicker
          c={c}
          title="Noise cancelling strength"
          ncLevel={ANC_LEVELS[status.current]}
          adaptive={adaptive}
          onChange={(p) => onChoose({ mode: 1, ncLevel: p.ncLevel ?? ncLevel, adaptive: p.adaptive })}
          status={status}
          testIDPrefix="strength"
        />
      )}
      {pref && <Text style={[s.fine, { color: c.muted }]}>BudPilot remembers this and puts it back if the earbuds change it by themselves.</Text>}
    </Card>
  );
}

const s = StyleSheet.create({
  fine: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
