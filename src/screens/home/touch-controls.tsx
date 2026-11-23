import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { F, useColors } from "@/theme";
import { BudIcon, FnIcon } from "@/ui/icons";
import { Card, controlStyle, ToggleRow, Txt } from "@/ui/kit";

import { PanelHead } from "./panels";
import type { BudPilot } from "./use-bud-pilot";

const EARS = [
  { ear: 1, label: "Left" },
  { ear: 2, label: "Right" },
];
export const gesture = (taps: number) => ["Tap", "Double tap", "Triple tap"][taps - 1] ?? `${taps} taps`;
export const fnName = (fn: number) => P.keyFunctions.find((f) => f.fn === fn)?.name ?? `Other (${fn})`;

function Taps({ n, color, column }: { n: number; color: string; column?: boolean }) {
  return (
    <View style={[s.taps, column && s.tapsColumn]} accessible={false}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={[s.tapDot, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

/** Both earbuds side by side; a gesture opens one picker of action tiles under them. */
export function TouchPanel({ b }: { b: BudPilot }) {
  const c = useColors();
  const state = b.state!;
  const [editing, setEditing] = useState<{ ear: number; taps: number }>();
  // a choice on its way to the earbuds: shown at once, kept only once they confirm it (otherwise the error shows)
  const [saving, setSaving] = useState<{ ear: number; taps: number; fn: number }>();
  const isSaving = (ear: number, taps: number) => saving?.ear === ear && saving.taps === taps;
  const fnOf = (ear: number, taps: number) =>
    isSaving(ear, taps) ? saving!.fn : state.keys.find((k) => k.ear === ear && k.taps === taps)?.fn;
  const tapCounts = [...new Set(state.keys.map((k) => k.taps))].sort((a, b) => a - b);
  const current = editing && fnOf(editing.ear, editing.taps);

  return (
    <>
      <PanelHead title="Touch controls" />
      <View style={s.ears}>
        {EARS.map((e) => (
          <Card key={e.ear} style={s.ear}>
            <View style={s.earHead}>
              <View style={[s.glyph, { backgroundColor: c.well }]}>
                <BudIcon color={c.ink2} size={20} flip={e.ear === 2} />
              </View>
              <Txt v="name">{e.label} earbud</Txt>
            </View>
            {tapCounts.map((taps) => {
              const fn = fnOf(e.ear, taps);
              const open = editing?.ear === e.ear && editing.taps === taps;
              return (
                <Pressable
                  key={taps}
                  testID={`key-${e.ear}-${taps}`}
                  accessibilityRole="button"
                  aria-expanded={open}
                  accessibilityLabel={`${e.label} ${gesture(taps)}: ${fn === undefined ? "not set" : fnName(fn)}. Change`}
                  onPress={fn === undefined ? undefined : () => setEditing(open ? undefined : { ear: e.ear, taps })}
                  style={({ pressed }) => [
                    s.gesture,
                    { borderColor: open ? c.tintEdge : "transparent", backgroundColor: open ? c.tint : pressed ? c.well : "transparent" },
                  ]}
                >
                  <Taps n={taps} color={c.ink} column />
                  <View style={s.grow}>
                    <View style={s.what}>
                      {fn !== undefined && <FnIcon fn={fn} color={c.signalInk} />}
                      <Text numberOfLines={1} style={[s.whatText, { color: c.ink }]}>
                        {fn === undefined ? "—" : fnName(fn)}
                      </Text>
                    </View>
                    <Txt v="sub" style={s.under}>
                      {isSaving(e.ear, taps) ? `${gesture(taps)} · Saving…` : gesture(taps)}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        ))}
      </View>

      {editing && (
        <Card style={[s.picker, { borderColor: c.tintEdge }]}>
          <Txt v="label">{`${EARS[editing.ear - 1].label} earbud · ${gesture(editing.taps)}`}</Txt>
          <View style={s.tiles} accessibilityRole="radiogroup" aria-label="Action">
            {P.keyFunctions.map((f) => {
              const on = f.fn === current;
              return (
                <Pressable
                  key={f.fn}
                  testID={`fn-${f.fn}`}
                  accessibilityRole="radio"
                  aria-checked={on}
                  onPress={() => {
                    const ed = editing;
                    setEditing(undefined);
                    if (on) return;
                    const mine = { ...ed, fn: f.fn };
                    setSaving(mine);
                    // a quicker second pick is its own save: only clear the label if it's still this one
                    void b.run((e) => e.setKey(ed.ear, ed.taps, f.fn))().finally(() => setSaving((s) => (s === mine ? undefined : s)));
                  }}
                  style={(state) => [
                    s.fn,
                    controlStyle((hover) => ({
                      ...(on ? { backgroundColor: c.tint, borderColor: c.tintEdge } : { backgroundColor: hover ? c.hover : c.card, borderColor: c.stroke }),
                      boxShadow: `${c.shine}, ${c.drop}`,
                    }))(state),
                  ]}
                >
                  <FnIcon fn={f.fn} color={on ? c.signalInk : c.ink2} size={20} />
                  <Text style={[s.fnText, { color: c.ink, fontFamily: on ? F.semibold : F.regular }]}>{f.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      <View style={[s.calls, { borderColor: c.hair }]}>
        <Txt v="title" style={s.callsTitle}>
          Press and hold
        </Txt>
        <Txt v="small">Off → ANC → Transparency</Txt>
      </View>
      <View style={[s.calls, { borderColor: c.hair }]}>
        <Txt v="title" style={s.callsTitle}>
          During calls
        </Txt>
        <View style={s.call}>
          <Taps n={1} color={c.ink2} />
          <Txt v="small">Tap answers</Txt>
        </View>
        <View style={s.call}>
          <Taps n={2} color={c.ink2} />
          <Txt v="small">Double tap hangs up</Txt>
        </View>
      </View>
      {b.volumeTaps.available && (
        <Card>
          <ToggleRow
            testID="volume-taps"
            title="Volume taps move Windows' volume"
            detail="Off: they only change the earbuds' own loudness, and Windows' slider stays put."
            value={b.volumeTaps.on}
            onChange={b.volumeTaps.setOn}
          />
        </Card>
      )}
    </>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  ears: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  ear: { flexGrow: 1, flexBasis: 260, padding: 12, gap: 2 },
  earHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, paddingBottom: 8 },
  glyph: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  gesture: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  taps: { flexDirection: "row", gap: 3, marginRight: 4 },
  tapsColumn: { width: 30, marginRight: 0 },
  tapDot: { width: 6, height: 6, borderRadius: 3 },
  what: { flexDirection: "row", alignItems: "center", gap: 8 },
  whatText: { fontFamily: F.medium, fontSize: 14, lineHeight: 19, flexShrink: 1 },
  under: { paddingLeft: 26 },
  picker: { borderRadius: 18 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fn: { flexGrow: 1, flexBasis: 104, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", gap: 6 },
  fnText: { fontSize: 12, lineHeight: 15, textAlign: "center" },
  calls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 18, rowGap: 6, borderWidth: 1, borderStyle: "dashed", borderRadius: 14, padding: 14 },
  callsTitle: { fontSize: 13 },
  call: { flexDirection: "row", alignItems: "center", gap: 2 },
});
