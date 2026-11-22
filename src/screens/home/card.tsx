import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

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

export const cardStyles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 13, lineHeight: 18 },
  smallButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
});

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 30 },
  title: cardStyles.title,
});
