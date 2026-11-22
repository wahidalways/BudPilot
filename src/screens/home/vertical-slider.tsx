import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Colors } from "@/theme";

type Props = {
  c: Colors;
  label: string;
  value: number;
  max: number;
  /** Every step while dragging (for the display). */
  onChange: (v: number) => void;
  /** Once per gesture, when the value should be sent. */
  onCommit: (v: number) => void;
};

const H = 132; // track height
const KNOB = 18;

export function VerticalSlider({ c, label, value, max, onChange, onCommit }: Props) {
  const clamp = (v: number) => Math.max(-max, Math.min(max, v));
  const start = useRef(value);
  const last = useRef(value);
  const top = useRef(0); // page y of the track's top, taken when a drag starts

  const fromY = (y: number) => clamp(Math.round(max - ((y - top.current) / H) * 2 * max));
  const move = (v: number) => {
    if (v === last.current) return;
    last.current = v;
    onChange(v);
  };
  const step = (d: number) => {
    const v = clamp(value + d);
    if (v === value) return;
    last.current = v;
    onChange(v);
    onCommit(v);
  };
  const release = () => {
    if (last.current !== start.current) onCommit(last.current);
  };

  const y = ((max - clamp(value)) / (2 * max)) * H; // knob centre
  const shown = value > 0 ? `+${value}` : `${value}`;

  return (
    <View style={s.col}>
      <Text style={[s.value, { color: value === 0 ? c.muted : c.text }]}>{shown}</Text>
      <View
        accessible
        focusable
        accessibilityRole="adjustable"
        accessibilityLabel={`${label} hertz`}
        accessibilityValue={{ min: -max, max, now: value, text: shown }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        // web keyboard: arrows move one step (react-native-web forwards onKeyDown)
        {...({
          onKeyDown: (e: { key: string; preventDefault(): void }) => {
            const d = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 } as Record<string, number>)[e.key];
            if (d) {
              e.preventDefault();
              step(d);
            }
          },
        } as object)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          const { locationY, pageY } = e.nativeEvent;
          top.current = pageY - locationY;
          start.current = last.current = value;
          move(fromY(pageY));
        }}
        onResponderMove={(e) => move(fromY(e.nativeEvent.pageY))}
        onResponderRelease={release}
        onResponderTerminate={release}
        style={s.hit}
      >
        <View pointerEvents="none" style={[s.bar, s.track, { backgroundColor: c.border }]} />
        <View pointerEvents="none" style={[s.bar, { backgroundColor: c.accent, top: Math.min(y, H / 2), height: Math.abs(y - H / 2) }]} />
        <View pointerEvents="none" style={[s.knob, { top: y - KNOB / 2, backgroundColor: c.card, borderColor: c.accent }]} />
      </View>
      <Text style={[s.label, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  col: { flex: 1, minWidth: 28, alignItems: "center", gap: 8 },
  value: { fontSize: 12, fontVariant: ["tabular-nums"] },
  hit: { height: H, alignSelf: "stretch" },
  bar: { position: "absolute", left: "50%", marginLeft: -2, width: 4, borderRadius: 2 },
  track: { top: 0, bottom: 0 },
  knob: { position: "absolute", left: "50%", marginLeft: -KNOB / 2, width: KNOB, height: KNOB, borderRadius: KNOB / 2, borderWidth: 2 },
  label: { fontSize: 11 },
});
