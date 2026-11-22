import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Colors } from "@/theme";

type Props<T extends string | number> = {
  c: Colors;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix?: string;
};

export function Segmented<T extends string | number>({ c, options, value, onChange, testIDPrefix }: Props<T>) {
  return (
    <View style={[s.wrap, { backgroundColor: c.sunken }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testIDPrefix && `${testIDPrefix}-${o.value}`}
            accessibilityRole="radio"
            aria-checked={on}
            onPress={on ? undefined : () => onChange(o.value)}
            style={[s.item, on && [s.on, { backgroundColor: c.card }]]}
          >
            <Text style={[s.text, { color: on ? c.text : c.muted, fontWeight: on ? "600" : "400" }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", borderRadius: 10, padding: 4, gap: 4 },
  item: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 8, justifyContent: "center" },
  on: { boxShadow: "0 1px 3px rgba(0,0,0,0.15)" },
  text: { textAlign: "center" },
});
