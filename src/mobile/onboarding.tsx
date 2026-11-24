// The first run (artifacts/shono-guidance.html): Welcome → Bluetooth access (location on Android 11 and older) →
// Connect, which connects by itself and offers a short tour of Home. Shown once; the tour can be replayed from App.
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { needsLocation, requestBluetoothAccess } from "@/ble/connect";
import type { BudPilot } from "@/screens/home/use-bud-pilot";
import { F, useColors, useTheme } from "@/theme";
import { later } from "@/utils/later";

import Ionicons from "@expo/vector-icons/Ionicons";

import { brandOf, PHOTOS } from "./art";
import { Button, Lockup, Press, Rise, SPRING, T, tick, Txt } from "./kit";
import { AccentPicker } from "./pages";
import { type Anchor, measureAnchor, Popover } from "./sheet";

type Step = "welcome" | "access" | "connect";
const STEPS: Step[] = ["welcome", "access", "connect"];

/** One step: slides in from the side it comes from, like the pages. */
function StepView({ active, dir, children }: { active: boolean; dir: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    p.set(reduce ? (active ? 1 : 0) : active ? withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }) : withTiming(0, { duration: 120 }));
  }, [active, reduce, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateX: (1 - p.get()) * dir * 28 }] }));
  return (
    <Animated.View pointerEvents={active ? "auto" : "none"} importantForAccessibility={active ? "auto" : "no-hide-descendants"} style={[StyleSheet.absoluteFill, a]}>
      {active ? children : null}
    </Animated.View>
  );
}

/** A segment of the progress bar: fills from the left when its step is reached. */
function Segment({ on }: { on: boolean }) {
  const c = useColors();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => p.set(withTiming(on ? 1 : 0, { duration: 520, easing: Easing.out(Easing.cubic) })), [on, p]);
  const a = useAnimatedStyle(() => ({ transform: [{ scaleX: p.get() }] }));
  return (
    <View style={[s.seg, { backgroundColor: c.well }]}>
      <Animated.View style={[s.segFill, { backgroundColor: c.signal }, a]} />
    </View>
  );
}

/** Three dots that pulse one after another, beside "Looking for your earbuds". */
function Looking() {
  const c = useColors();
  return (
    <View style={s.looking} accessibilityLiveRegion="polite">
      {[0, 1, 2].map((i) => (
        <Pulse key={i} delay={i * 150} color={c.signal} />
      ))}
      <Txt v="sub">Looking for your earbuds</Txt>
    </View>
  );
}
function Pulse({ delay, color }: { delay: number; color: string }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0.3);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => p.set(withRepeat(withSequence(withTiming(1, { duration: 480 }), withTiming(0.3, { duration: 720 })), -1)), delay);
    return () => clearTimeout(t);
  }, [delay, reduce, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scale: 0.8 + p.get() * 0.2 }] }));
  return <Animated.View style={[s.dot, { backgroundColor: color }, a]} />;
}

/** Fades between two photos of the case: without the maker's logo while searching, the device's own once found. */
function CasePhoto({ found }: { found: boolean }) {
  const p = useSharedValue(found ? 1 : 0);
  useEffect(() => p.set(withTiming(found ? 1 : 0, { duration: 500 })), [found, p]);
  const branded = useAnimatedStyle(() => ({ opacity: p.get() }));
  const plain = useAnimatedStyle(() => ({ opacity: (1 - p.get()) * 0.45 }));
  return (
    <View style={s.find}>
      <Animated.Image source={PHOTOS.casePlain} resizeMode="contain" style={[s.findImg, plain]} />
      <Animated.Image source={PHOTOS.case} resizeMode="contain" style={[s.findImg, StyleSheet.absoluteFill, branded]} />
    </View>
  );
}

const shake = (v: { set: (x: number) => void }) =>
  v.set(withSequence(withTiming(-6, { duration: 60 }), withTiming(5, { duration: 60 }), withTiming(-3, { duration: 60 }), withSpring(0, SPRING)));

/** The first run, over the app. `onDone(tour)`: finished, with or without the tour. */
export function Onboarding({ b, onDone }: { b: BudPilot; onDone: (tour: boolean) => void }) {
  const c = useColors();
  const { setLook } = useTheme();
  const [palette, setPalette] = useState<Anchor>(); // the colours, beside their button at the top
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("welcome");
  const [from, setFrom] = useState<Step>("welcome");
  const [access, setAccess] = useState<"asking" | "denied" | "blocked">();
  const go = (next: Step) => {
    setFrom(step);
    setStep(next);
  };
  const i = STEPS.indexOf(step);
  const dirOf = (k: Step) => (k === step ? Math.sign(i - STEPS.indexOf(from)) || 1 : Math.sign(STEPS.indexOf(k) - i));
  const location = needsLocation();
  const { width, height } = useWindowDimensions();
  const form = Math.min(width, height) < 600 ? "phone" : width > height ? "sideways" : "upright";
  const live = b.status === "connected" && !!b.state;
  const { logo, model } = brandOf(b.state?.name ?? "");
  const shaken = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shaken.get() }] }));

  // the Connect step connects by itself; if that fails, it says why and offers to try again
  const { status, error, connect } = b;
  useEffect(() => {
    if (step !== "connect") return;
    if (status === "idle" && !error) return void connect();
    // the earbuds dropped here and the quick retries gave up (Shono's own auto-connect waits for the first run)
    if (status === "reconnecting") return later(() => void connect({ auto: true }), 20_000);
  }, [step, status, error, connect]);

  const askAccess = async () => {
    setAccess("asking");
    const r = await requestBluetoothAccess();
    if (r === "granted") {
      setAccess(undefined);
      go("connect");
    } else setAccess(r);
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.ground }]}>
      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        {step === "welcome" ? (
          <View style={s.wordmark}>
            <Lockup />
          </View>
        ) : (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={() => go(STEPS[i - 1])} style={s.iconBtn}>
              <Ionicons name="chevron-back" size={24} color={c.ink} />
            </Pressable>
            <View style={s.progress} accessibilityLabel={`Step ${i} of 2`}>
              <Segment on={i >= 1} />
              <Segment on={i >= 2} />
            </View>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Colour"
          hitSlop={8}
          onPress={(ev) => {
            tick();
            void measureAnchor(ev.currentTarget, setPalette);
          }}
          style={[s.iconBtn, s.right]}
        >
          <View style={[s.swatch, { backgroundColor: c.signalFill, borderColor: c.hair }]} />
        </Pressable>
        <Popover anchor={palette} label="Colour" width={300} onClose={() => setPalette(undefined)}>
          <View style={s.palette}>
            <Txt v="small" muted>
              Colour
            </Txt>
            <AccentPicker />
          </View>
        </Popover>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={c.dark ? "Switch to light mode" : "Switch to dark mode"}
          hitSlop={8}
          onPress={() => {
            tick();
            setLook({ theme: c.dark ? "light" : "dark" });
          }}
          style={s.iconBtn}
        >
          <Ionicons name={c.dark ? "sunny-outline" : "moon-outline"} size={22} color={c.ink} />
        </Pressable>
      </View>

      <View style={s.steps}>
        <StepView active={step === "welcome"} dir={dirOf("welcome")}>
          <StepLayout
            form={form}
            align="end"
            bottom={insets.bottom}
            art={
              <View style={[s.hero, form !== "phone" && s.heroTablet]}>
                <Rise k={0} style={s.heroBud}>
                  <Image source={PHOTOS.left} resizeMode="contain" style={s.heroImg} />
                </Rise>
                <Rise k={1} style={s.heroCase}>
                  <Image source={PHOTOS.casePlain} resizeMode="contain" style={s.heroImg} />
                </Rise>
                <Rise k={2} style={s.heroBud}>
                  <Image source={PHOTOS.right} resizeMode="contain" style={s.heroImg} />
                </Rise>
              </View>
            }
            body={
              <>
                <Rise k={3}>
                  <Txt v="big" accessibilityRole="header">
                    Welcome to Shono
                  </Txt>
                </Rise>
                <Rise k={4}>
                  <Txt v="sub" style={s.p}>
                    Control your earbuds from one place: noise control, sound, game mode and touch.
                  </Txt>
                </Rise>
                <Rise k={5}>
                  <Txt v="sub" style={s.note}>
                    Shono means <Text style={{ color: c.ink, fontFamily: F.semibold }}>“listen”</Text> in Bangla.
                  </Txt>
                </Rise>
              </>
            }
            foot={
              <Rise k={6} style={s.foot}>
                <Button label="Get started" kind="pri" style={s.cta} onPress={() => go("access")} />
                <Txt v="sub" style={s.center}>
                  Works with a growing list of earbuds
                </Txt>
              </Rise>
            }
          />
        </StepView>

        <StepView active={step === "access"} dir={dirOf("access")}>
          <StepLayout
            form={form}
            align="center"
            bottom={insets.bottom}
            art={
              <Rise k={0}>
                <View style={[s.icon, form === "sideways" && s.iconBig, { backgroundColor: c.tint }]}>
                  <Ionicons name={location ? "location-outline" : "bluetooth"} size={form === "sideways" ? 52 : 30} color={c.signalInk} />
                </View>
              </Rise>
            }
            body={
              <>
                <Rise k={1}>
                  <Txt v="big" accessibilityRole="header">
                    {location ? "Allow location access" : "Allow Bluetooth access"}
                  </Txt>
                </Rise>
                <Rise k={2}>
                  <Txt v="sub" style={s.p}>
                    {location
                      ? "On Android 11 and older, Android only lets apps look for Bluetooth devices when they have location access and Location is on."
                      : "Shono uses Bluetooth to find your earbuds and change their settings. Android will ask you for Nearby devices access."}
                  </Txt>
                </Rise>
                <Rise k={3} style={s.facts}>
                  {(location ? ["Used only to find your earbuds", "Shono doesn't save or share where you are"] : ["Used only to talk to your earbuds", "No location access needed"]).map((f) => (
                    <View key={f} style={s.fact}>
                      <Ionicons name="checkmark-circle" size={20} color={c.ok} />
                      <Txt>{f}</Txt>
                    </View>
                  ))}
                </Rise>
                {access === "denied" || access === "blocked" ? (
                  <Animated.View style={[s.alert, { backgroundColor: c.well }]}>
                    <Txt v="sub" style={{ color: c.ink }}>
                      {access === "blocked"
                        ? "Android won't ask again. Allow it in Settings › Apps › Shono › Permissions, then come back."
                        : "Shono can't reach your earbuds without it. Tap Continue to try again."}
                    </Txt>
                  </Animated.View>
                ) : null}
              </>
            }
            foot={
              <View style={s.foot}>
                {access === "blocked" && <Button label="Open settings" kind="out" style={s.cta} onPress={() => void Linking.openSettings()} />}
                <Button label={access === "asking" ? "Waiting for Android…" : "Continue"} kind="pri" style={s.cta} onPress={() => void askAccess()} />
              </View>
            }
          />
        </StepView>

        <StepView active={step === "connect"} dir={dirOf("connect")}>
          <StepLayout
            form={form}
            align="center"
            bottom={insets.bottom}
            art={
              <Rise k={0} style={s.findWrap}>
                <CasePhoto found={live} />
                {!live && !b.error ? <Looking /> : <View style={s.lookingSpace} />}
              </Rise>
            }
            body={
              <>
                <Txt v="big" accessibilityRole="header">
                  {live ? "You're connected" : "Open the case"}
                </Txt>
                <Txt v="sub" style={s.p}>
                  {live ? "Your earbuds are ready. Take a quick look at the main controls?" : "Keep your earbuds close to your phone. Shono finds and connects to them by itself."}
                </Txt>
                {live && (
                  <Rise k={0}>
                    <View style={[s.devRow, { backgroundColor: c.raised, borderColor: c.hair }]}>
                      <View style={s.grow}>
                        <View style={s.inline}>
                          {logo && <Image source={logo.src} accessibilityLabel="hoco" resizeMode="contain" style={{ height: 12, width: 12 * logo.aspect, tintColor: c.ink }} />}
                          <Txt v="strong" style={{ fontFamily: F.semibold }}>
                            {model || b.state!.name}
                          </Txt>
                        </View>
                        <Txt v="sub">
                          {(["left", "right", "case"] as const)
                            .map((k) => `${k[0].toUpperCase()}${k.slice(1)} ${b.state!.battery[k]?.percent ?? "—"}%`)
                            .join(" · ")}
                        </Txt>
                      </View>
                      <View style={s.inline}>
                        <Ionicons name="checkmark-circle" size={18} color={c.ok} />
                        <Txt v="small" style={{ color: c.ok }}>
                          Connected
                        </Txt>
                      </View>
                    </View>
                  </Rise>
                )}
                {!live && b.error ? (
                  <View style={[s.alert, { backgroundColor: c.well }]}>
                    <Txt v="sub" style={{ color: c.ink }}>
                      {b.error}
                      {location ? " On Android 11 and older, Location must be on to find Bluetooth devices." : ""}
                    </Txt>
                  </View>
                ) : null}
                {!live && (
                  <View style={s.tip}>
                    <Ionicons name="information-circle-outline" size={17} color={c.ink2} />
                    <Txt v="sub" style={s.grow}>
                      Close other apps that control your earbuds first. They allow one app at a time.
                    </Txt>
                  </View>
                )}
              </>
            }
            foot={
              <View style={s.foot}>
                <Animated.View style={[s.cta, shakeStyle]}>
                  <Button
                    kind="pri"
                    label={live ? "Show me around" : b.error ? "Try again" : "Searching…"}
                    style={s.cta}
                    onPress={() => {
                      if (live) return onDone(true);
                      if (b.error && b.status === "idle") return void b.connect();
                      shake(shaken); // still looking: the button says so instead of doing nothing
                    }}
                  />
                </Animated.View>
                <Press accessibilityRole="button" onPress={() => onDone(false)} style={[s.skip, !live && s.hidden]} disabled={!live}>
                  <Text style={[T.strong, { color: c.signalInk, fontFamily: F.semibold }]}>Skip the tour</Text>
                </Press>
              </View>
            }
          />
        </StepView>
      </View>
    </View>
  );
}

/** How a first-run step sits on the screen. Phone: the picture, the words, and the buttons low for the thumb
 * (`align`: the words at the bottom, centred, or in a scroll). Tablet upright: all of it one centred block, the buttons
 * right under the words. Tablet sideways: the picture on the left half, the words and buttons centred on the right
 * (the user, 2026-11-24: the text sat low with the top empty). */
function StepLayout({
  form,
  align,
  bottom,
  art,
  body,
  foot,
}: {
  form: "phone" | "upright" | "sideways";
  align: "end" | "center";
  bottom: number;
  art: ReactNode;
  body: ReactNode;
  foot: ReactNode;
}) {
  if (form === "sideways")
    return (
      <View style={[s.side, { paddingBottom: bottom + 24 }]}>
        <View style={s.sideArt}>
          <View style={s.sideArtIn}>{art}</View>
        </View>
        <ScrollView style={s.sideWords} contentContainerStyle={s.sideWordsIn} showsVerticalScrollIndicator={false}>
          {body}
          <View style={s.sideFoot}>{foot}</View>
        </ScrollView>
      </View>
    );
  if (form === "upright")
    return (
      <ScrollView style={s.grow} contentContainerStyle={[s.upright, { paddingBottom: bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {art}
        {body}
        <View style={s.sideFoot}>{foot}</View>
      </ScrollView>
    );
  return (
    <View style={[s.step, { paddingBottom: bottom + 24 }]}>
      <View style={[s.body, align === "center" && s.centered]}>
        {art}
        {body}
      </View>
      {foot}
    </View>
  );
}

// ───────── Tour ─────────

export type Rect = { x: number; y: number; w: number; h: number };
export type TourStop = { title: string; body: string; locate: () => Promise<Rect | undefined>; radius?: number };

/** A spotlight that springs from card to card, with a tip card under it (beside it on tablets) and Skip on every stop. */
const TIP_W = 340; // the tour card's width on a tablet

export function Tour({ stops, onEnd, tablet }: { stops: TourStop[]; onEnd: (finished: boolean) => void; tablet: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const tipH = useRef(190); // the card's real height once it has laid out (text size and the stop change it)
  const spotRect = useRef<Rect>(undefined);
  const root = useRef<ComponentRef<typeof View>>(null);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const r = useSharedValue(26);
  const tipY = useSharedValue(0);
  const tipX = useSharedValue(16);
  const shown = useSharedValue(0);
  const stop = stops[i];

  // the tip card: beside the spotlight on a tablet when there's room on its right, else below it (or above, whichever
  // fits; the roomier side when neither does), always inside the status and navigation bars
  const placeTip = (animate: boolean) => {
    const rect = spotRect.current;
    if (!rect) return;
    const th = tipH.current;
    const to = (v: typeof tipX, n: number) => v.set(animate && !reduce ? withSpring(n, SPRING) : n);
    const top = insets.top + 12;
    const bottom = screenH - insets.bottom - 12;
    const inside = (n: number) => Math.max(top, Math.min(n, bottom - th));
    const tipW = tablet ? TIP_W : screenW - 32;
    if (tablet && rect.x + rect.w + 18 + tipW + 16 <= screenW) {
      to(tipX, rect.x + rect.w + 18);
      return to(tipY, inside(rect.y));
    }
    to(tipX, tablet ? Math.min(Math.max(rect.x, 16), screenW - tipW - 16) : 16);
    const below = rect.y + rect.h + 16;
    const above = rect.y - 16 - th;
    const roomBelow = bottom - below;
    const roomAbove = above + th - top;
    to(tipY, inside(roomBelow >= th || (roomAbove < th && roomBelow >= roomAbove) ? below : above));
  };

  useEffect(() => {
    let gone = false;
    // the card's place relative to this overlay: Android may measure from below the status bar (Expo Go does) while the
    // overlay starts at the top of the screen, so both are measured the same way and subtracted
    const origin = new Promise<{ x: number; y: number }>((res) => (root.current ? root.current.measureInWindow((x, y) => res({ x, y })) : res({ x: 0, y: 0 })));
    void Promise.all([stop.locate(), origin]).then(([found, o]) => {
      if (gone) return;
      if (!found) return i + 1 < stops.length ? setI(i + 1) : onEnd(true); // its card isn't there (e.g. disconnected)
      const rect = { ...found, x: found.x - o.x, y: found.y - o.y };
      const pad = 6;
      const first = shown.get() === 0;
      const to = (v: typeof x, n: number) => v.set(first || reduce ? n : withSpring(n, SPRING));
      to(x, rect.x - pad);
      to(y, rect.y - pad);
      to(w, rect.w + pad * 2);
      to(h, rect.h + pad * 2);
      r.set(stop.radius ?? 26);
      spotRect.current = rect;
      placeTip(!first);
      shown.set(withTiming(1, { duration: 260 }));
    });
    return () => {
      gone = true;
    };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps -- move only when the stop changes

  const spot = useAnimatedStyle(() => ({
    opacity: shown.get(),
    width: w.get(),
    height: h.get(),
    borderRadius: r.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));
  const tip = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateX: tipX.get() }, { translateY: tipY.get() }] }));
  const last = i === stops.length - 1;
  return (
    <View ref={root} collapsable={false} style={StyleSheet.absoluteFill}>
      {/* everything outside the spotlight dims: one huge shadow around a clear rounded box */}
      <Animated.View
        pointerEvents="none"
        style={[s.spot, { boxShadow: `0 0 0 3000px ${c.dark ? "rgba(0,0,0,0.7)" : "rgba(6,8,14,0.58)"}`, borderColor: c.dark ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)" }, spot]}
      />
      <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => {}} />
      <Animated.View
        accessibilityViewIsModal
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (Math.abs(h - tipH.current) < 1) return;
          tipH.current = h;
          placeTip(shown.get() > 0); // a taller card (bigger text, a longer stop) moves to stay on screen
        }}
        style={[s.tipCard, { width: tablet ? TIP_W : screenW - 32, backgroundColor: c.dark ? "#22262E" : c.surface }, tip]}
      >
        <Animated.View key={i} entering={reduce ? undefined : FadeIn.duration(260)}>
          <Txt v="small" style={{ color: c.signalInk, fontFamily: F.semibold }}>
            {i + 1} of {stops.length}
          </Txt>
          <Txt v="name" style={s.tipTitle} accessibilityRole="header">
            {stop.title}
          </Txt>
          <Txt v="sub" style={{ fontSize: 14, lineHeight: 20 }}>
            {stop.body}
          </Txt>
        </Animated.View>
        <View style={s.tipBtns}>
          <Pressable accessibilityRole="button" onPress={() => onEnd(false)} hitSlop={8} style={[s.tipSkip, last && s.hidden]} disabled={last}>
            <Text style={[T.strong, { color: c.signalInk, fontFamily: F.semibold, fontSize: 14 }]}>Skip</Text>
          </Pressable>
          <Button label={last ? "Done" : "Next"} kind="pri" style={s.tipNext} onPress={() => (last ? onEnd(true) : setI(i + 1))} />
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  right: { marginLeft: "auto" },
  hidden: { opacity: 0 },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, zIndex: 2 },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 12, height: 44 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  progress: { flex: 1, flexDirection: "row", gap: 6, maxWidth: 520 },
  seg: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  segFill: { flex: 1, transformOrigin: "left" },
  steps: { flex: 1 },
  step: { flex: 1, paddingHorizontal: 24, alignSelf: "center", width: "100%", maxWidth: 560 },
  body: { flex: 1, justifyContent: "flex-end", paddingBottom: 28 },
  side: { flex: 1, flexDirection: "row", alignItems: "center", gap: 56, paddingHorizontal: 56, alignSelf: "center", width: "100%", maxWidth: 1120 },
  sideArt: { flex: 1, alignItems: "center", justifyContent: "center" },
  sideArtIn: { width: "100%", maxWidth: 440, alignItems: "center" },
  sideWords: { flex: 1, maxWidth: 480 },
  sideWordsIn: { flexGrow: 1, justifyContent: "center", paddingVertical: 24 },
  sideFoot: { marginTop: 28 },
  upright: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, alignSelf: "center", width: "100%", maxWidth: 560 },
  heroTablet: { height: 240, marginBottom: 0, alignSelf: "stretch" },
  iconBig: { width: 112, height: 112, borderRadius: 32 },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  palette: { gap: 8, padding: 8 },
  centered: { justifyContent: "center" },
  hero: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 6, marginBottom: 34, height: 170 },
  heroBud: { flex: 1, height: 150 },
  heroCase: { flex: 1.25, height: 160 },
  heroImg: { width: "100%", height: "100%" },
  p: { marginTop: 10, fontSize: 15.5, lineHeight: 23 },
  note: { marginTop: 14 },
  foot: { gap: 12, alignItems: "center" },
  cta: { alignSelf: "stretch", height: 54, borderRadius: 16 },
  skip: { height: 40, justifyContent: "center", paddingHorizontal: 12 },
  icon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  facts: { marginTop: 18, gap: 10 },
  fact: { flexDirection: "row", alignItems: "center", gap: 10 },
  alert: { marginTop: 16, borderRadius: 14, padding: 14 },
  findWrap: { alignItems: "center", marginBottom: 24 },
  find: { width: 180, height: 150 },
  findImg: { width: "100%", height: "100%" },
  looking: { flexDirection: "row", alignItems: "center", gap: 8, height: 22, marginTop: 18 },
  lookingSpace: { height: 22, marginTop: 18 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  devRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18, padding: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  tip: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 18 },
  spot: { position: "absolute", left: 0, top: 0, borderWidth: 2 },
  tipCard: { position: "absolute", left: 0, top: 0, borderRadius: 22, padding: 18, paddingBottom: 14, boxShadow: "0 16px 40px rgba(0,0,0,0.28)" },
  tipTitle: { fontSize: 18, marginTop: 4, marginBottom: 6 },
  tipBtns: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  tipSkip: { paddingVertical: 8, paddingHorizontal: 4 },
  tipNext: { height: 40, paddingHorizontal: 18, borderRadius: 12 },
});
