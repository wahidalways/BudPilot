// Bluetooth must be on: while it's off, this screen covers Shono, and Android's own "turn on Bluetooth" dialog shows
// once each time it goes off. Shown only once Shono may use Bluetooth (the first run asks first).
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bluetoothState, hasBluetoothAccess, turnOnBluetooth, watchBluetooth } from "@/ble/connect";
import { F, useColors } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";

import { Button, Press, Rise, T, Txt } from "./kit";

function useBluetoothOff(onBack: () => void) {
  const [off, setOff] = useState(false);
  const asked = useRef(false); // the dialog shows once per time it goes off; then the button asks again
  const back = useRef(onBack);
  useEffect(() => {
    back.current = onBack;
  });
  useEffect(() => {
    let alive = true;
    let wasOff = false;
    const look = async () => {
      const [state, access] = await Promise.all([bluetoothState(), hasBluetoothAccess()]);
      if (!alive) return;
      const now = access && state === "off";
      setOff(now);
      if (wasOff && !now) back.current();
      wasOff = now;
      if (!now) asked.current = false;
      else if (!asked.current && AppState.currentState === "active") {
        asked.current = true;
        void turnOnBluetooth();
      }
    };
    void look();
    // Bluetooth switching tells us; coming back to Shono (after Android's own dialogs) also catches access granted
    const app = AppState.addEventListener("change", (s) => s === "active" && void look());
    let unwatch = () => {};
    void watchBluetooth(() => void look()).then((u) => (alive ? (unwatch = u) : u()));
    return () => {
      alive = false;
      app.remove();
      unwatch();
    };
  }, []);
  return off;
}

/** `onBack`: Bluetooth came back on (the first run's Connect step tries again then). */
export function BluetoothGate({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const off = useBluetoothOff(onBack);
  if (!off) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      accessibilityViewIsModal
      style={[StyleSheet.absoluteFill, { backgroundColor: c.ground }]}
    >
      <View style={[s.step, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={s.body}>
          <Rise k={0}>
            <View style={[s.icon, { backgroundColor: c.tint }]}>
              <Ionicons name="bluetooth" size={30} color={c.signalInk} />
            </View>
          </Rise>
          <Rise k={1}>
            <Txt v="big" accessibilityRole="header">
              Turn on Bluetooth
            </Txt>
          </Rise>
          <Rise k={2}>
            <Txt v="sub" style={s.p}>
              Shono talks to your earbuds over Bluetooth, so it needs to be on. Your settings are kept on the earbuds meanwhile.
            </Txt>
          </Rise>
        </View>
        <View style={s.foot}>
          <Button label="Turn on Bluetooth" kind="pri" style={s.cta} onPress={() => void turnOnBluetooth()} />
          <Press accessibilityRole="button" onPress={() => void Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS").catch(() => undefined)} style={s.link}>
            <Text style={[T.strong, { color: c.signalInk, fontFamily: F.semibold }]}>Bluetooth settings</Text>
          </Press>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  step: { flex: 1, paddingHorizontal: 24, alignSelf: "center", width: "100%", maxWidth: 560 },
  body: { flex: 1, justifyContent: "center" },
  icon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  p: { marginTop: 10, fontSize: 15.5, lineHeight: 23 },
  foot: { gap: 12, alignItems: "center" },
  cta: { alignSelf: "stretch", height: 54, borderRadius: 16 },
  link: { height: 40, justifyContent: "center", paddingHorizontal: 12 },
});
