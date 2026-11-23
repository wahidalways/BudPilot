// Find my earbuds (design: artifacts/shono-layout-switch.html › Find my earbuds). Play a sound on one earbud or both,
// with the bytes hoco.music sends (Earbuds.findSound); and Last seen: where the phone was when the earbuds last
// disconnected, read once at that moment by the native side (modules/shono-keeper/LastSeen.kt) and kept on this phone.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Image, Linking, PermissionsAndroid, Platform, StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";

import { knownEarbudsAddress } from "@/ble/connect";
import type { BudPilot } from "@/screens/home/use-bud-pilot";
import { F, useColors } from "@/theme";
import { loadPref, savePref } from "@/utils/prefs";

import { getLastSeen, type LastSeenPlace, onLastSeen, setLastSeen } from "../../modules/shono-keeper";
import { PHOTOS } from "./art";
import { useGlass, useSurface } from "./glass";
import { Button, Card, CardHead, Press, T, tick, ToggleRow, Txt } from "./kit";
import { Sheet } from "./sheet";

// ───────── Last seen: on or off (the keeper also runs while it's on, so it can note the place in the background) ─────────

const LAST_SEEN_KEY = "budpilot.lastSeen";
let lastSeenOn = !!loadPref<boolean>(LAST_SEEN_KEY);
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useLastSeenOn = () => useSyncExternalStore(subscribe, () => lastSeenOn);
function setLastSeenOn(on: boolean) {
  lastSeenOn = on;
  savePref(LAST_SEEN_KEY, on);
  listeners.forEach((l) => l());
}

/** The Find page: Play a sound, then Last seen. `wide`: side by side (a tablet's page). */
export function FindPage({ b, wide }: { b: BudPilot; wide?: boolean }) {
  return (
    <View style={wide ? s.two : s.stack}>
      <View style={wide && s.grow}>
        <PlaySound b={b} />
      </View>
      <View style={wide && s.grow}>
        <LastSeenCard b={b} />
      </View>
    </View>
  );
}

/** Home's way in on a phone. */
export function FindCard({ onOpen }: { onOpen: () => void }) {
  const c = useColors();
  return (
    <Press accessibilityRole="button" accessibilityLabel="Find my earbuds" onPress={onOpen} scale={0.98}>
      <Card style={s.cardRow}>
        <View style={[s.glyph, { backgroundColor: c.well }]}>
          <Ionicons name="location-outline" size={20} color={c.ink} />
        </View>
        <View style={s.grow}>
          <Txt v="name">Find my earbuds</Txt>
          <Txt v="sub">Play a sound, or see where they were last</Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.ink2} />
      </Card>
    </Press>
  );
}

// ───────── Play a sound ─────────

type Ears = { left: boolean; right: boolean };
const NONE: Ears = { left: false, right: false };
const SECONDS = 60; // the earbuds stop by themselves after this (hoco.music uses the same)

function PlaySound({ b }: { b: BudPilot }) {
  const c = useColors();
  const live = b.status === "connected" && !!b.state;
  const [want, setWant] = useState<Ears>(NONE);
  const [error, setError] = useState<string>();
  const on = live ? want : NONE; // disconnecting stops it, and so does the screen
  // the earbuds stop after a minute: so does the screen
  useEffect(() => {
    if (!want.left && !want.right) return;
    const t = setTimeout(() => setWant(NONE), SECONDS * 1000);
    return () => clearTimeout(t);
  }, [want]);

  const send = (next: Ears) => {
    tick();
    const before = on;
    setWant(next);
    setError(undefined);
    const ears = next.left && next.right ? "both" : next.left ? "left" : next.right ? "right" : "off";
    let failed = false;
    void b
      .run((e) =>
        e.findSound(ears, SECONDS).catch((err: unknown) => {
          failed = true;
          throw err;
        }),
      )()
      .then(() => {
        if (!failed) return;
        setWant(before);
        setError("Your earbuds didn't answer. Try again.");
      });
  };
  const both = on.left && on.right;

  return (
    <Card>
      <CardHead title="Play a sound" />
      {live ? (
        <>
          <View style={s.warn}>
            <Ionicons name="alert-circle-outline" size={15} color={c.ink2} style={{ marginTop: 1 }} />
            <Txt v="sub" style={s.grow}>
              {"Take them out of your ears first: it's loud. It stops by itself after a minute."}
            </Txt>
          </View>
          <View style={s.tiles}>
            <EarTile label="Left" photo={PHOTOS.left} playing={on.left} onPress={() => send({ ...on, left: !on.left })} />
            <EarTile label="Right" photo={PHOTOS.right} playing={on.right} onPress={() => send({ ...on, right: !on.right })} />
          </View>
          <Button label={both ? "Stop" : "Play on both"} kind={both ? "out" : "pri"} onPress={() => send(both ? NONE : { left: true, right: true })} />
          {error ? <Txt v="sub" style={{ color: c.danger }}>{error}</Txt> : null}
        </>
      ) : (
        <Txt v="sub">Your earbuds need to be connected to play a sound. Take them out of the case, and Shono connects by itself.</Txt>
      )}
    </Card>
  );
}

/** One earbud: its photo, and while it plays, rings pulse out of it. */
function EarTile({ label, photo, playing, onPress }: { label: string; photo: number; playing: boolean; onPress: () => void }) {
  const c = useColors();
  const surface = useSurface();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={playing ? `${label} earbud playing. Stop` : `Play a sound on the ${label.toLowerCase()} earbud`}
      onPress={onPress}
      style={[s.tile, playing ? { backgroundColor: c.tint, borderColor: c.tintEdge } : { backgroundColor: surface.bg, borderColor: surface.edge }]}
    >
      <View style={s.photoBox}>
        <Ring on={playing} delay={0} color={c.signal} />
        <Ring on={playing} delay={800} color={c.signal} />
        <Image source={photo} resizeMode="contain" style={s.photo} />
      </View>
      <Text style={[T.strong, { fontFamily: F.semibold, color: c.ink }]}>{label}</Text>
      <Txt v="small" style={{ color: playing ? c.signalInk : c.ink2 }}>
        {playing ? "Playing · tap to stop" : "Tap to play"}
      </Txt>
    </Press>
  );
}

function Ring({ on, delay, color }: { on: boolean; delay: number; color: string }) {
  const { motion } = useGlass();
  const p = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(p);
    p.set(0);
    if (on && motion) p.set(withDelay(delay, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) }), -1)));
  }, [on, motion, delay, p]);
  const a = useAnimatedStyle(() => ({ opacity: on ? (1 - p.get()) * 0.7 : 0, transform: [{ scale: 0.5 + p.get() * 1.1 }] }));
  return <Animated.View pointerEvents="none" style={[s.ring, { borderColor: color }, a]} />;
}

// ───────── Last seen ─────────

const when = (at: number) => {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  return days === 0 ? `Today, ${time}` : days === 1 ? `Yesterday, ${time}` : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
};

async function askLocation() {
  if (Platform.OS !== "android") return false;
  const r = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
  return Object.values(r).includes(PermissionsAndroid.RESULTS.GRANTED); // an approximate place is fine too
}

/** Where the earbuds were last seen (null: not yet), kept current as the native side notes a new place. */
function useLastSeenPlace() {
  const [seen, setSeen] = useState<LastSeenPlace | null>(null);
  useEffect(() => {
    let alive = true;
    const look = () => void getLastSeen().then((v) => alive && setSeen(v));
    look();
    const sub = onLastSeen(look);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return seen;
}

function LastSeenCard({ b }: { b: BudPilot }) {
  const c = useColors();
  const on = useLastSeenOn();
  const seen = useLastSeenPlace();
  const [asking, setAsking] = useState(false); // the sheet before Android's question
  const [denied, setDenied] = useState(false);
  // tell the native side which earbuds to watch: their address, known once Shono has found them
  const connected = b.status === "connected";
  useEffect(() => setLastSeen(on, knownEarbudsAddress()), [on, connected]);

  const allow = async () => {
    setAsking(false);
    const ok = await askLocation();
    setDenied(!ok);
    if (ok) setLastSeenOn(true);
  };

  return (
    <Card>
      <CardHead title="Last seen" />
      <ToggleRow
        first
        title="Remember where I last used them"
        detail="Saves this phone's location when your earbuds disconnect. It stays on this phone."
        value={on}
        onChange={(v) => (v ? setAsking(true) : setLastSeenOn(false))}
      />
      {on && seen ? (
        <View style={[s.seen, { borderTopColor: c.hair }]}>
          <Ionicons name="location" size={22} color={c.signal} />
          <View style={s.grow}>
            <Txt v="strong">{when(seen.at)}</Txt>
            <Txt v="sub">
              {seen.place ? `Near ${seen.place}` : `${seen.lat.toFixed(5)}, ${seen.lng.toFixed(5)}`} · within {Math.max(5, Math.round(seen.accuracy))} m
            </Txt>
          </View>
        </View>
      ) : null}
      {on && seen ? (
        <Button
          label="Open in Maps"
          kind="out"
          onPress={() => void Linking.openURL(`geo:${seen.lat},${seen.lng}?q=${seen.lat},${seen.lng}(Your earbuds)`).catch(() => undefined)}
        />
      ) : (
        <Txt v="sub">
          {on
            ? "Shono saves the spot the next time your earbuds disconnect from this phone."
            : denied
              ? "Android didn't allow location, so Last seen stays off. You can allow it in Android's settings for Shono."
              : "Off. Shono doesn't use your location for this."}
        </Txt>
      )}
      <Sheet open={asking} tablet={false} title="Allow location for Last seen?" sub="Shono saves where your phone is when your earbuds disconnect, so you can find them later. It stays on this phone. Android asks next." onClose={() => setAsking(false)}>
        <View style={s.sheetBtns}>
          <Button label="Continue" kind="pri" onPress={() => void allow()} />
          <Button label="Not now" kind="out" onPress={() => setAsking(false)} />
        </View>
      </Sheet>
    </Card>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  stack: { gap: 12 },
  two: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  glyph: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  warn: { flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: -4 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, borderRadius: 20, borderWidth: 1, alignItems: "center", gap: 4, paddingTop: 14, paddingBottom: 12 },
  photoBox: { width: 90, height: 90, alignItems: "center", justifyContent: "center" },
  photo: { height: 82, width: 60 },
  ring: { position: "absolute", width: 76, height: 76, borderRadius: 38, borderWidth: 2 },
  seen: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  sheetBtns: { gap: 10, paddingTop: 4 },
});
