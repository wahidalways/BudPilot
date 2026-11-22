import type { ReactNode } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import type { Colors } from "@/theme";

export function Card({ c, title, action, children }: { c: Colors; title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {(title || action) && (
        <View style={s.head}>
          <Text style={[s.title, { color: c.text }]}>{title}</Text>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

/** Title, one line of detail, and an on/off switch. */
export function ToggleRow({ c, title, detail, value, onChange }: { c: Colors; title: string; detail: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      <View style={s.grow}>
        <Text style={[s.title, { color: c.text }]}>{title}</Text>
        <Text style={{ color: c.muted }}>{detail}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.accent, false: c.border }}
        thumbColor="#FFFFFF"
        {...({ activeThumbColor: "#FFFFFF" } as object)} // react-native-web's "on" knob (defaults to teal)
      />
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 13, lineHeight: 18 },
  smallButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
});

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 30 },
  title: cardStyles.title,
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1 },
});
