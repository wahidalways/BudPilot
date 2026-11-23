import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { desktop } from "@/hooks/use-desktop";
import { F, useColors } from "@/theme";
import { Rim } from "@/ui/frost";
import { NavIcon, WindowIcon } from "@/ui/icons";
import { Mark, Txt } from "@/ui/kit";

import { AppPanel, EqualizerPanel, GamePanel, PanelHead, SoundPanel } from "./panels";
import { batteryLine, ConnectState, ErrorNote } from "./parts";
import { TouchPanel } from "./touch-controls";
import type { BudPilot } from "./use-bud-pilot";

const PANELS = [
  { key: "sound", label: "Sound", Panel: SoundPanel },
  { key: "eq", label: "Equalizer", Panel: EqualizerPanel },
  { key: "game", label: "Game", Panel: GamePanel },
  { key: "touch", label: "Touch controls", Panel: TouchPanel },
  { key: "app", label: "App", Panel: AppPanel },
] as const;
type PanelKey = (typeof PANELS)[number]["key"];

const WINDOW_BUTTONS = [
  { kind: "minimize", label: "Minimize" },
  { kind: "maximize", label: "Maximize" },
  { kind: "close", label: "Close (BudPilot keeps running in the tray)" },
] as const;

/** The page's own title bar: drag to move; the buttons look like Windows 11's. */
function TitleBar() {
  const c = useColors();
  const d = desktop();
  return (
    <View style={s.titleBar} {...({ dataSet: { drag: "1" } } as object)}>
      <View style={s.titleBrand}>
        <Mark size={18} />
        <Text style={[s.titleText, { color: c.ink2 }]}>BudPilot</Text>
      </View>
      {d && (
        <View style={s.winButtons}>
          {WINDOW_BUTTONS.map(({ kind, label }) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => d.window(kind)}
              style={(state) => {
                const hovered = (state as { hovered?: boolean }).hovered;
                return [s.winButton, hovered && { backgroundColor: kind === "close" ? "#C42B1C" : c.well }];
              }}
            >
              {(state) => <WindowIcon kind={kind} color={kind === "close" && (state as { hovered?: boolean }).hovered ? "#FFFFFF" : c.ink} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** The settings window: a floating glass sidebar and the chosen page. */
export function Settings({ b }: { b: BudPilot }) {
  const c = useColors();
  const [panel, setPanel] = useState<PanelKey>("sound");
  const narrow = useWindowDimensions().width < 640;
  const connected = b.status === "connected" && !!b.state;
  const page = PANELS.find((p) => p.key === panel)!;
  const needsEarbuds = panel !== "app";

  return (
    <View style={s.page}>
      <Rim />
      <TitleBar />
      <View style={[s.body, narrow && s.bodyNarrow]}>
        <View style={[s.rail, narrow && s.railNarrow, { backgroundColor: c.side, borderColor: c.stroke, boxShadow: c.shine }]}>
          {!narrow && (
            <View style={s.who}>
              <Txt v="name" numberOfLines={1}>
                {b.state?.name ?? "BudPilot"}
              </Txt>
              <Txt v="sub" numberOfLines={1}>
                {connected ? batteryLine(b) : b.status === "reconnecting" ? "Waiting for your earbuds" : "Not connected"}
              </Txt>
            </View>
          )}
          {PANELS.map((p) => {
            const on = p.key === panel;
            return (
              <Pressable
                key={p.key}
                testID={`nav-${p.key}`}
                accessibilityRole="tab"
                aria-selected={on}
                onPress={() => setPanel(p.key)}
                style={({ pressed }) => [
                  s.nav,
                  on && { backgroundColor: c.lens, boxShadow: `${c.shine}, ${c.drop}` },
                  !on && pressed && { backgroundColor: c.card },
                ]}
              >
                <NavIcon panel={p.key} color={on ? c.ink : c.ink2} />
                <Text style={[s.navText, { color: on ? c.ink : c.ink2, fontFamily: on ? F.semibold : F.regular }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={s.scroller} contentContainerStyle={s.content}>
          {connected && <ErrorNote b={b} />}
          {needsEarbuds && !connected ? (
            <>
              <PanelHead title={page.label} />
              <ConnectState b={b} />
            </>
          ) : (
            <page.Panel b={b} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  // the web ScrollView puts itself on its own layer (translateZ); over the frost that layer has no solid background,
  // and Chromium then draws its text without ClearType
  scroller: { flex: 1, transform: "none" },
  titleBar: { height: 38, flexDirection: "row", alignItems: "center" },
  titleBrand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14 },
  titleText: { fontFamily: F.semibold, fontSize: 12 },
  winButtons: { flexDirection: "row", alignSelf: "stretch" },
  winButton: { width: 46, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, flexDirection: "row" },
  bodyNarrow: { flexDirection: "column" },
  rail: { width: 212, marginLeft: 10, marginBottom: 10, marginTop: 2, borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, gap: 2 },
  railNarrow: { width: "auto", flexDirection: "row", flexWrap: "wrap", marginRight: 10, paddingVertical: 6 },
  who: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 14, gap: 2 },
  nav: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12 },
  navText: { fontSize: 14, lineHeight: 19 },
  content: { paddingTop: 20, paddingBottom: 28, paddingHorizontal: 24, gap: 16, maxWidth: 760 },
});
