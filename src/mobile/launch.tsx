// The loading screen (the user's pick of three, "C · Glow"; design in artifacts/shono-loading.html). Android's own
// splash shows Shono's mark on the plain ground until the app can draw; this takes over with the same mark in the same
// place, so the hand-over can't be seen, then the name and "Listen your way." rise under it, Home's glows breathe behind,
// and a comet of light runs along a short track. It leaves once the earbuds answer (Home then opens with them), or after
// a short while if they don't (Home's earbuds card then looks for them). Only at a cold start: Shono usually stays alive.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";

import { F, useColors } from "@/theme";

import { Backdrop, groundOf } from "./glass";
import { Mark, TAGLINE } from "./kit";

const MARK = 76; // the size of Android's splash image (app.json), so the mark doesn't jump at the hand-over
const SHORTEST_MS = 650; // long enough to read the name
const LONGEST_MS = 1300; // the earbuds didn't answer by now: Home opens and looks for them itself

// Android's splash stays up until Shono's first frame is ready (app.native.tsx holds it); this lets it go
let hideNative = () => {};
export const setNativeSplashHider = (hide: () => void) => void (hideNative = hide);

export function Launch({ ready, onGone }: { ready: boolean; onGone: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [shortest, setShortest] = useState(false);
  const [longest, setLongest] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setShortest(true), SHORTEST_MS);
    const b = setTimeout(() => setLongest(true), LONGEST_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const leaving = longest || (shortest && ready);

  const fade = useSharedValue(1);
  const words = useSharedValue(reduce ? 1 : 0);
  const glow = useSharedValue(1);
  const comet = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    words.set(withDelay(80, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })));
    glow.set(withRepeat(withTiming(0.7, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true));
    comet.set(withRepeat(withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.quad) }), -1));
  }, [reduce, words, glow, comet]);
  useEffect(() => {
    if (!leaving) return;
    fade.set(withTiming(0, { duration: reduce ? 120 : 280 }));
    const t = setTimeout(onGone, reduce ? 140 : 300);
    return () => clearTimeout(t);
  }, [leaving, reduce, fade, onGone]);

  const all = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const rise = useAnimatedStyle(() => ({ opacity: words.get(), transform: [{ translateY: (1 - words.get()) * 8 }] }));
  const breathe = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const head = useAnimatedStyle(() => ({ transform: [{ translateX: -60 + comet.get() * 190 }] }));

  return (
    <Animated.View
      accessible
      accessibilityLabel={`Shono. ${TAGLINE} Loading`}
      onLayout={() => hideNative()}
      style={[StyleSheet.absoluteFill, { backgroundColor: groundOf(c) }, all]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, breathe]}>
        <Backdrop shift={0} />
      </Animated.View>
      <View style={s.center}>
        <Mark size={MARK} />
        <Animated.View style={[s.words, rise]}>
          <Text style={[s.name, { color: c.ink }]}>Shono</Text>
          <Text style={[s.tag, { color: c.ink2 }]}>{TAGLINE}</Text>
        </Animated.View>
      </View>
      {!reduce && (
        <View style={[s.track, { backgroundColor: c.well }]}>
          {/* the comet: its tail fades out behind it */}
          <Animated.View style={[s.head, { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0), ${c.signal})` }, head]} />
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // the mark exactly in the middle, where Android's splash had it; the words hang under it
  center: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  words: { position: "absolute", top: "50%", marginTop: MARK / 2 + 16, alignItems: "center" },
  name: { fontFamily: F.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  tag: { fontFamily: F.medium, fontSize: 14, marginTop: 2 },
  track: { position: "absolute", bottom: "13%", alignSelf: "center", width: 132, height: 3, borderRadius: 2, overflow: "hidden" },
  head: { width: 60, height: 3, borderRadius: 2 },
});
