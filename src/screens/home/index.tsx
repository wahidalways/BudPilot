import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAdaptiveAnc } from "@/hooks/use-adaptive-anc";
import { useEarbuds } from "@/hooks/use-earbuds";
import { useGameMode } from "@/hooks/use-game-mode";
import type { Battery } from "@/jieli/earbuds";
import { type Colors, useColors } from "@/theme";

import { Card, cardStyles, ToggleRow } from "./card";
import { EqualizerCard } from "./equalizer";
import { GameTab } from "./game";
import { NoiseControlCard } from "./noise-control";
import { Segmented } from "./segmented";
import { TouchControlsCard } from "./touch-controls";

const TABS = [
  { value: "sound", label: "Sound" },
  { value: "eq", label: "Equalizer" },
  { value: "game", label: "Game" },
  { value: "controls", label: "Controls" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export function Home() {
  const c = useColors();
  const { status, state, error, busy, connect, disconnect, run, noisePref, setNoise } = useEarbuds();
  const game = useGameMode({ state, connected: status === "connected", run });
  const autoLevel = useCallback((level: number) => void run((e) => e.setAnc(1, level))(), [run]);
  // Adaptive runs app-wide (any tab, or hidden in the tray)
  const adaptive = useAdaptiveAnc(state, noisePref, autoLevel);
  const [tab, setTab] = useState<Tab>("sound");

  if (status === "reconnecting") {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <Text style={[s.brand, { color: c.text }]}>BudPilot</Text>
        <Text style={[s.lead, { color: c.muted }]}>
          Waiting for your earbuds… BudPilot connects by itself when you take them out of the case, and puts your noise setting back.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={disconnect}
          style={({ pressed }) => [cardStyles.smallButton, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: c.text }}>Stop</Text>
        </Pressable>
      </View>
    );
  }

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
          onPress={status === "idle" ? () => void connect() : undefined}
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
          <Text style={[s.title, { color: c.text }]} numberOfLines={1}>
            {state.name}
          </Text>
          <Text style={{ color: c.muted }}>{busy ? "Sending…" : "Connected"}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={disconnect}
          style={({ pressed }) => [cardStyles.smallButton, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: c.text }}>Disconnect</Text>
        </Pressable>
      </View>

      <View style={s.batteries}>
        <BatteryPill c={c} label="Left" b={state.battery.left} />
        <BatteryPill c={c} label="Case" b={state.battery.case} />
        <BatteryPill c={c} label="Right" b={state.battery.right} />
      </View>

      <Segmented c={c} options={[...TABS]} value={tab} onChange={setTab} testIDPrefix="tab" />
      {error && <Text style={[s.inlineError, { color: c.danger }]}>{error}</Text>}

      {tab === "sound" && (
        <>
          <NoiseControlCard
            c={c}
            state={state}
            pref={noisePref}
            onChoose={(p) => void setNoise(p)}
            status={adaptive}
          />
          {state.wearDetection !== undefined && (
            <Card c={c}>
              <ToggleRow
                c={c}
                title="Wear detection"
                detail="Senses when the earbuds are in your ears"
                value={state.wearDetection}
                onChange={(on) => void run((e) => e.setWearDetection(on))()}
              />
            </Card>
          )}
        </>
      )}

      {tab === "eq" && <EqualizerCard c={c} state={state} onSet={(mode, gains) => run((e) => e.setEq(mode, gains))()} />}

      {tab === "game" && <GameTab c={c} game={game} />}

      {tab === "controls" && <TouchControlsCard c={c} state={state} onSet={(ear, taps, fn) => run((e) => e.setKey(ear, taps, fn))()} />}
    </ScrollView>
  );
}

function BatteryPill({ c, label, b }: { c: Colors; label: string; b: Battery }) {
  return (
    <View
      style={[s.pill, { backgroundColor: c.card, borderColor: c.border }]}
      accessible
      accessibilityLabel={`${label} battery ${b ? `${b.percent} percent${b.charging ? ", charging" : ""}` : "not available"}`}
    >
      <Text style={[s.pillLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[s.pillValue, { color: c.text }]}>{b ? `${b.percent}%` : "—"}</Text>
      {b?.charging && <Text style={[s.pillLabel, { color: c.accent }]}>Charging</Text>}
    </View>
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
  title: { fontSize: 20, fontWeight: "700" },
  inlineError: { paddingHorizontal: 4 },
  batteries: { flexDirection: "row", gap: 8 },
  pill: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", gap: 2 },
  pillLabel: { fontSize: 12 },
  pillValue: { fontSize: 20, fontWeight: "700" },
});
