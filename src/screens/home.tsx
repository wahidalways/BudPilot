import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { useEarbuds } from "@/hooks/use-earbuds";
import type { Battery, EqPreset } from "@/jieli/earbuds";
import { type Colors, useColors } from "@/theme";

const NOISE = [
  { mode: 0, label: "Off" },
  { mode: 1, label: "Noise cancelling" },
  { mode: 2, label: "Transparency" },
];

export function Home() {
  const c = useColors();
  const { status, state, error, busy, connect, disconnect, run } = useEarbuds();

  if (status !== "connected" || !state) {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <Text style={[s.brand, { color: c.text }]}>BudPilot</Text>
        <Text style={[s.lead, { color: c.muted }]}>
          Open the case or put your earbuds in, then connect. Disconnect other apps that control them first.
        </Text>
        <Pressable
          testID="connect"
          accessibilityRole="button"
          onPress={status === "idle" ? connect : undefined}
          style={({ pressed }) => [s.primary, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[s.primaryText, { color: c.onAccent }]}>{status === "connecting" ? "Connecting…" : "Connect earbuds"}</Text>
        </Pressable>
        {error && <Text style={[s.error, { color: c.danger }]}>{error}</Text>}
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={s.page}>
      <View style={s.header}>
        <View style={s.grow}>
          <Text style={[s.title, { color: c.text }]}>{state.name}</Text>
          <Text style={{ color: c.muted }}>Connected</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={disconnect}
          style={({ pressed }) => [s.outline, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: c.text }}>Disconnect</Text>
        </Pressable>
      </View>
      {error && <Text style={[s.inlineError, { color: c.danger }]}>{error}</Text>}

      <Card c={c} title="Battery">
        <View style={s.row}>
          <BatteryCell c={c} label="Left" b={state.battery.left} />
          <BatteryCell c={c} label="Right" b={state.battery.right} />
          <BatteryCell c={c} label="Case" b={state.battery.case} />
        </View>
      </Card>

      <Card c={c} title="Noise control">
        <View style={[s.segment, { backgroundColor: c.sunken }]}>
          {NOISE.filter((n) => state.ancGains[n.mode]).map((n) => {
            const on = state.anc === n.mode;
            return (
              <Pressable
                key={n.mode}
                testID={`anc-${n.mode}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, busy }}
                onPress={on ? undefined : run((e) => e.setAnc(n.mode))}
                style={[s.segItem, on && [s.segOn, { backgroundColor: c.card }]]}
              >
                <Text style={{ color: on ? c.text : c.muted, fontWeight: on ? "600" : "400", textAlign: "center" }}>{n.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card c={c} title="Equalizer">
        <View style={s.grid}>
          {state.eqPresets.map((p, i) => (
            <PresetTile
              key={p.mode}
              c={c}
              label={`Preset ${i + 1}`}
              preset={p}
              active={p.mode === state.eqMode}
              onPress={run((e) => e.setEqPreset(p))}
            />
          ))}
        </View>
      </Card>

      <Card c={c}>
        <View style={s.header}>
          <View style={s.grow}>
            <Text style={[s.cardTitle, { color: c.text }]}>Game mode</Text>
            <Text style={{ color: c.muted }}>Lower audio delay, for games</Text>
          </View>
          <Switch
            testID="game"
            value={state.gameMode}
            onValueChange={(on) => run((e) => e.setGameMode(on))()}
            trackColor={{ true: c.accent, false: c.border }}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

function Card({ c, title, children }: { c: Colors; title?: string; children: ReactNode }) {
  return (
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {title && <Text style={[s.cardTitle, s.cardTitleGap, { color: c.text }]}>{title}</Text>}
      {children}
    </View>
  );
}

function BatteryCell({ c, label, b }: { c: Colors; label: string; b: Battery }) {
  return (
    <View style={s.grow} accessible accessibilityLabel={`${label} battery ${b ? `${b.percent} percent${b.charging ? ", charging" : ""}` : "not available"}`}>
      <Text style={{ color: c.muted }}>{label}</Text>
      <Text style={[s.percent, { color: c.text }]}>{b ? `${b.percent}%` : "—"}</Text>
      <Text style={{ color: c.muted }}>{b?.charging ? "Charging" : " "}</Text>
    </View>
  );
}

const BAR_SCALE = 12; // dB shown at full bar height

function PresetTile({ c, label, preset, active, onPress }: { c: Colors; label: string; preset: EqPreset; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={active ? undefined : onPress}
      style={[s.tile, { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accentSoft : "transparent" }]}
    >
      <View style={s.bars}>
        {preset.gains.map((g, i) => {
          const h = Math.max(1.5, (Math.min(Math.abs(g), BAR_SCALE) / BAR_SCALE) * 14);
          return (
            <View key={i} style={s.barSlot}>
              <View style={[s.bar, { height: h, top: g > 0 ? 14 - h : 14, backgroundColor: active ? c.accent : c.muted }]} />
            </View>
          );
        })}
      </View>
      <Text style={{ color: active ? c.text : c.muted, fontSize: 12, fontWeight: active ? "600" : "400" }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  brand: { fontSize: 32, fontWeight: "700" },
  lead: { fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 340 },
  primary: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  primaryText: { fontSize: 16, fontWeight: "600" },
  error: { textAlign: "center", maxWidth: 340 },
  page: { padding: 16, gap: 12, width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1 },
  title: { fontSize: 22, fontWeight: "700" },
  outline: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  inlineError: { paddingHorizontal: 4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardTitleGap: { marginBottom: 12 },
  row: { flexDirection: "row", gap: 12 },
  percent: { fontSize: 26, fontWeight: "700", marginVertical: 2 },
  segment: { flexDirection: "row", borderRadius: 10, padding: 4, gap: 4 },
  segItem: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8, justifyContent: "center" },
  segOn: { boxShadow: "0 1px 3px rgba(0,0,0,0.15)" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "18%", flexGrow: 1, minWidth: 64, borderWidth: 1, borderRadius: 10, padding: 8, gap: 6, alignItems: "center" },
  bars: { flexDirection: "row", height: 28, gap: 2, alignSelf: "stretch" },
  barSlot: { flex: 1 },
  bar: { position: "absolute", left: 0, right: 0, borderRadius: 1 },
});
