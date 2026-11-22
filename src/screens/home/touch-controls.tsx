import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import type { EarbudsState } from "@/jieli/earbuds";
import type { Colors } from "@/theme";

import { Card, cardStyles } from "./card";

type Props = { c: Colors; state: EarbudsState; onSet: (ear: number, taps: number, fn: number) => Promise<void> };

const EARS = [
  { ear: 1, label: "Left" },
  { ear: 2, label: "Right" },
];
const gesture = (taps: number) => ["Tap", "Double tap", "Triple tap"][taps - 1] ?? `${taps} taps`;
const fnName = (fn: number) => P.keyFunctions.find((f) => f.fn === fn)?.name ?? `Other (${fn})`;

/** Both ears side by side, so every gesture is visible at once; a cell opens the choices. */
export function TouchControlsCard({ c, state, onSet }: Props) {
  const [editing, setEditing] = useState<{ ear: number; taps: number }>();
  const fnOf = (ear: number, taps: number) => state.keys.find((k) => k.ear === ear && k.taps === taps)?.fn;
  const tapCounts = [...new Set(state.keys.map((k) => k.taps))].sort((a, b) => a - b);
  const current = editing && fnOf(editing.ear, editing.taps);

  return (
    <Card c={c} title="Touch controls">
      <View style={s.row}>
        <View style={s.gesture} />
        {EARS.map((e) => (
          <Text key={e.ear} style={[s.cellHead, { color: c.muted }]}>
            {e.label}
          </Text>
        ))}
      </View>
      {tapCounts.map((taps) => (
        <View key={taps} style={s.row}>
          <Text style={[s.gesture, { color: c.text }]}>{gesture(taps)}</Text>
          {EARS.map((e) => {
            const fn = fnOf(e.ear, taps);
            return (
              <Pressable
                key={e.ear}
                testID={`key-${e.ear}-${taps}`}
                accessibilityRole="button"
                accessibilityLabel={`${e.label} ${gesture(taps)}: ${fn === undefined ? "not set" : fnName(fn)}. Change`}
                onPress={fn === undefined ? undefined : () => setEditing({ ear: e.ear, taps })}
                style={({ pressed }) => [s.cell, { borderColor: c.border, backgroundColor: pressed ? c.sunken : "transparent" }]}
              >
                <Text style={[s.cellText, { color: c.text }]} numberOfLines={1}>
                  {fn === undefined ? "—" : fnName(fn)}
                </Text>
                <Text style={{ color: c.muted }}>›</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={[cardStyles.hint, { color: c.muted }]}>During calls, a tap answers and a double tap hangs up.</Text>

      <Modal transparent visible={!!editing} animationType="fade" onRequestClose={() => setEditing(undefined)}>
        <Pressable style={s.backdrop} accessibilityLabel="Close" onPress={() => setEditing(undefined)}>
          {/* inner Pressable keeps taps on the sheet from closing it */}
          <Pressable style={[s.sheet, { backgroundColor: c.card }]} onPress={() => {}}>
            <Text style={[cardStyles.title, s.sheetTitle, { color: c.text }]}>
              {editing && `${EARS[editing.ear - 1].label} · ${gesture(editing.taps)}`}
            </Text>
            {P.keyFunctions.map((f) => {
              const on = f.fn === current;
              return (
                <Pressable
                  key={f.fn}
                  testID={`fn-${f.fn}`}
                  accessibilityRole="radio"
                  aria-checked={on}
                  onPress={() => {
                    const ed = editing!;
                    setEditing(undefined);
                    if (!on) void onSet(ed.ear, ed.taps, f.fn);
                  }}
                  style={({ pressed }) => [s.option, { borderColor: c.border, backgroundColor: pressed ? c.sunken : "transparent" }]}
                >
                  <Text style={{ color: c.text, fontWeight: on ? "600" : "400" }}>{f.name}</Text>
                  <View style={[s.radio, { borderColor: on ? c.accent : c.border }]}>
                    {on && <View style={[s.dot, { backgroundColor: c.accent }]} />}
                  </View>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  gesture: { width: 84 },
  cellHead: { flex: 1, fontSize: 13 },
  cell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  cellText: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  sheet: { borderRadius: 14, padding: 16, width: "100%", maxWidth: 360, alignSelf: "center" },
  sheetTitle: { marginBottom: 8 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
