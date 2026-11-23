import { Pressable, StyleSheet, View } from "react-native";

import { desktop } from "@/hooks/use-desktop";
import { F, useColors } from "@/theme";
import { Rim } from "@/ui/frost";
import { GearIcon } from "@/ui/icons";
import { IconButton, Mark, Txt } from "@/ui/kit";
import { seconds, today } from "@/utils/corrections";

import { ConnectState, DeviceCard, EqPills, ErrorNote, GameRow, KeepChip, NoiseControl } from "./parts";
import type { BudPilot } from "./use-bud-pilot";

const openSettings = () => desktop()?.window("settings");

/** The tray flyout: the everyday surface, 360 px wide; the window takes its height from this. */
export function Flyout({ b }: { b: BudPilot }) {
  const c = useColors();
  const connected = b.status === "connected" && !!b.state;
  const { count, fastestMs } = today(b.corrections);

  return (
    <View style={s.page} onLayout={(e) => desktop()?.setFlyoutHeight(e.nativeEvent.layout.height)}>
      <Rim />
      <View style={s.top}>
        <Mark />
        <Txt v="brand">Shono</Txt>
        <View style={s.chipSlot}>{connected && <KeepChip b={b} />}</View>
        <IconButton label="All settings" onPress={openSettings}>
          <GearIcon color={c.ink2} />
        </IconButton>
      </View>

      {connected ? (
        <>
          <DeviceCard b={b} />
          <ErrorNote b={b} />
          <NoiseControl b={b} />
          <View style={s.section}>
            <Txt v="label">Sound</Txt>
            <EqPills b={b} />
          </View>
          <GameRow b={b} chip />
        </>
      ) : (
        <ConnectState b={b} />
      )}

      <View style={[s.foot, { borderTopColor: c.hair }]}>
        <Txt v="sub" style={s.grow} numberOfLines={1}>
          {count ? `Undid ${count} today · fastest ${seconds(fastestMs!)}` : b.keep ? "Nothing to undo today" : "Not keeping a setting"}
        </Txt>
        <Pressable accessibilityRole="button" onPress={openSettings} hitSlop={6}>
          <Txt v="sub" style={{ color: c.signalInk, fontFamily: F.semibold }}>
            All settings ›
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 14 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  chipSlot: { flex: 1, flexDirection: "row", justifyContent: "flex-end", minWidth: 0, marginLeft: 4 },
  section: { gap: 8 },
  grow: { flex: 1 },
  foot: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, paddingTop: 12 },
});
