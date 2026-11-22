import { StyleSheet, Text, View } from "react-native";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { ANC_LEVELS, type AdaptiveStatus } from "@/hooks/use-adaptive-anc";
import type { Colors } from "@/theme";
import { nearestIndex, roomWord } from "@/utils/adaptive-anc";

import { cardStyles } from "./card";
import { Segmented } from "./segmented";

const STRENGTHS = [...P.ancLevels.map((l, i) => ({ value: String(i), label: l.name })), { value: "adaptive", label: "Adaptive" }];

type Props = {
  c: Colors;
  title: string;
  ncLevel: number;
  adaptive: boolean;
  onChange: (p: { ncLevel?: number; adaptive: boolean }) => void;
  /** Adaptive's live status, when it is running for this picker */
  status?: AdaptiveStatus;
  testIDPrefix: string;
};

/** Low / Mid / High / Adaptive noise cancelling strength. */
export function StrengthPicker({ c, title, ncLevel, adaptive, onChange, status, testIDPrefix }: Props) {
  const room = status?.on ? status.room : undefined;
  return (
    <View style={s.wrap}>
      <Text style={[s.label, { color: c.text }]}>{title}</Text>
      <Segmented
        c={c}
        options={STRENGTHS}
        value={adaptive ? "adaptive" : String(nearestIndex(ncLevel, ANC_LEVELS))}
        onChange={(v) => onChange(v === "adaptive" ? { adaptive: true } : { ncLevel: ANC_LEVELS[Number(v)], adaptive: false })}
        testIDPrefix={testIDPrefix}
      />
      {status &&
        room &&
        (room.error ? (
          <Text style={[cardStyles.hint, { color: c.danger }]}>{room.error}</Text>
        ) : (
          <View>
            <Text style={[cardStyles.hint, { color: c.text }]}>
              {room.db === undefined ? "Listening to the room…" : `${P.ancLevels[status.current].name} now: ${roomWord(room.db)} around you`}
            </Text>
            <Text style={[s.fine, { color: c.muted }]}>Uses {room.mic ?? "your computer's microphone"} for loudness only. Nothing is recorded.</Text>
          </View>
        ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8, paddingTop: 4 },
  label: { fontSize: 14, fontWeight: "600" },
  fine: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
