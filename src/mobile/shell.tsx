// The phone and tablet app: tabs (phone) or a side rail with the earbuds beside the page (tablet), pages that slide in
// from the side of the tab you picked, the App sheet, and the note when Shono puts your noise setting back.
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type BudPilot, modeName, useBudPilot } from "@/screens/home/use-bud-pilot";
import { F, useColors } from "@/theme";
import { BudsIcon, GearIcon, NavIcon } from "@/ui/icons";
import { seconds } from "@/utils/corrections";
import { loadPref, savePref } from "@/utils/prefs";

import { DeviceCard, HomeCards, NoiseCard, type TourRefs } from "./home";
import { useKeeper } from "./keeper";
import { Mark, Onboarding, type Rect, Tour, type TourStop } from "./onboarding";
import { SPRING, tick, Txt } from "./kit";
import { AppContent, EqPage, GamePage, SoundPage, TouchPage } from "./pages";
import { Sheet, Toast } from "./sheet";

type ViewNode = ComponentRef<typeof View>;
type ScrollNode = ComponentRef<typeof ScrollView>;
type Tab = "home" | "sound" | "eq" | "game" | "touch" | "app";
const PHONE_TABS: [Tab, string][] = [
  ["home", "Home"],
  ["sound", "Sound"],
  ["eq", "EQ"],
  ["game", "Game"],
  ["touch", "Touch"],
];
const TABLET_TABS: [Tab, string][] = [
  ["sound", "Sound"],
  ["eq", "EQ"],
  ["game", "Game"],
  ["touch", "Touch"],
  ["app", "App"],
];
const TITLES: Record<Tab, string> = { home: "Shono", sound: "Sound", eq: "Equalizer", game: "Game", touch: "Touch controls", app: "App" };
const LEDES: Partial<Record<Tab, string>> = {
  sound: "What the room sounds like in your ears.",
  game: "Lowest audio delay, for games and videos.",
  touch: "What each tap does. Saved on the earbuds.",
  app: "Look and feel, and the earbuds Shono talks to.",
};
const barColor = (dark: boolean) => (dark ? "rgb(17,19,24)" : "rgb(244,245,248)");

const TabIcon = ({ tab, color }: { tab: Tab; color: string }) =>
  tab === "home" ? <BudsIcon color={color} size={22} strokeWidth={1.8} /> : <NavIcon panel={tab} color={color} size={22} />;

// What the Windows shell does every few seconds: connect whenever the earbuds are around. Not during the first run: its
// Connect step asks for Bluetooth access first, then connects.
function useAutoConnect(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const auto = () => (globalThis as { __budpilotAutoConnect?: () => void }).__budpilotAutoConnect?.();
    auto();
    const t = setInterval(auto, 5000);
    return () => clearInterval(t);
  }, [on]);
}

const ONBOARDED_KEY = "budpilot.onboarded";
type Note = { title: string; sub: string; at: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inWindow = (v: ViewNode | null) =>
  new Promise<Rect | undefined>((res) => (v ? v.measureInWindow((x, y, w, h) => res(w ? { x, y, w, h } : undefined)) : res(undefined)));
const offsetIn = (v: ViewNode, parent: ViewNode) => new Promise<number>((res) => v.measureLayout(parent, (_x, y) => res(y), () => res(0)));
function useTourRefs(): TourRefs {
  const stack = useRef<ViewNode>(null);
  const device = useRef<ViewNode>(null);
  const noise = useRef<ViewNode>(null);
  const eq = useRef<ViewNode>(null);
  const game = useRef<ViewNode>(null);
  return { stack, device, noise, eq, game };
}
const STOPS = {
  device: ["Your earbuds", "Battery for each earbud and the case. A green number means it's charging."],
  noise: ["Noise control", "Choose Off, ANC or Transparency. ANC starts at Low; pick a stronger level just below it."],
  eq: ["Equalizer", "Tap a preset or one of your own EQs. Edit opens the full curve."],
  game: ["Game mode", "Cuts audio delay for games and videos. Game EQ can play while it's on."],
  tabs: ["Everything else", "Sound, EQ, Game and Touch each have a tab. The gear holds theme, accent and this tour."],
  rail: ["Everything else", "Sound, EQ, Game, Touch and App each have a page in this rail."],
} as const;

/** "Put Off back · 0.12 s", for a put-back that happens while Shono is open (when "Tell me when Shono steps in" is on). */
function usePutBackNote(b: BudPilot) {
  const [since] = useState(() => Date.now());
  const latest = b.corrections[0];
  if (!latest || latest.at < since || !b.notice.on) return undefined;
  return {
    title: latest.from === latest.to ? `${modeName(latest.to)} strength put back` : `Put ${modeName(latest.to)} back`,
    sub: `${seconds(latest.ms)} · the earbuds switched by themselves`,
    at: latest.at,
  };
}

/** A page: slides in from the side of its tab and fades, scrolls under a top bar that fills in as you scroll. */
function Page({
  active,
  dir,
  title,
  lede,
  top,
  bottom,
  bar,
  scrollRef,
  children,
}: {
  active: boolean;
  dir: number;
  title?: string;
  lede?: string;
  top: number;
  bottom: number;
  bar?: ReactNode;
  scrollRef?: RefObject<ScrollNode | null>;
  children: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const p = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    p.set(reduce ? (active ? 1 : 0) : active ? withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }) : withTiming(0, { duration: 160 }));
  }, [active, reduce, p]);
  const move = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateX: (1 - p.get()) * dir * 28 }] }));
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  const barFill = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [0, 28], [0, 1], "clamp") }));
  const small = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [26, 50], [0, 1], "clamp"),
    transform: [{ translateY: interpolate(y.get(), [26, 50], [6, 0], "clamp") }],
  }));
  return (
    <Animated.View pointerEvents={active ? "auto" : "none"} accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"} style={[StyleSheet.absoluteFill, move]}>
      <Animated.ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: 16 }}>
        {title && (
          <View style={s.titles}>
            <Txt v="big" accessibilityRole="header">
              {title}
            </Txt>
            {lede ? <Txt v="sub" style={s.lede}>{lede}</Txt> : null}
          </View>
        )}
        {children}
      </Animated.ScrollView>
      {bar !== undefined && (
        <View pointerEvents="box-none" style={[s.bar, { height: insets.top + 56, paddingTop: insets.top }]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: barColor(c.dark), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair }, barFill]} />
          {bar ?? (
            <Animated.Text style={[s.barTitle, { color: c.ink }, small]} numberOfLines={1}>
              {title}
            </Animated.Text>
          )}
        </View>
      )}
    </Animated.View>
  );
}

/** The phone's tab bar: a tinted pill glides to the chosen tab, whose icon pops. */
function TabBar({ tabs, cur, onTab, navRef }: { tabs: [Tab, string][]; cur: Tab; onTab: (t: Tab) => void; navRef: RefObject<ViewNode | null> }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const tw = w ? (w - 20) / tabs.length : 0;
  const i = tabs.findIndex((t) => t[0] === cur);
  const x = useSharedValue(-1);
  useEffect(() => {
    if (!tw) return;
    x.set(x.get() < 0 || reduce ? i * tw : withSpring(i * tw, SPRING));
  }, [i, tw, reduce, x]);
  const glide = useAnimatedStyle(() => ({ opacity: x.get() < 0 ? 0 : 1, transform: [{ translateX: Math.max(0, x.get()) }] }));
  return (
    <View
      ref={navRef}
      collapsable={false}
      accessibilityRole="tablist"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[s.tabbar, { paddingBottom: insets.bottom + 8, backgroundColor: barColor(c.dark), borderTopColor: c.hair }]}
    >
      {tw > 0 && (
        <Animated.View pointerEvents="none" style={[s.glide, { width: tw }, glide]}>
          <View style={[s.glidePill, { backgroundColor: c.tint }]} />
        </Animated.View>
      )}
      {tabs.map(([k, label]) => {
        const on = k === cur;
        const color = on ? c.signalInk : c.ink2;
        return (
          <Pressable
            key={k}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            onPress={() => {
              if (on) return;
              tick();
              onTab(k);
            }}
            style={s.tab}
          >
            <Pop on={on}>
              <TabIcon tab={k} color={color} />
            </Pop>
            <Text style={[s.tabLabel, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Springs its child up from a little smaller when it becomes chosen. */
function Pop({ on, children }: { on: boolean; children: ReactNode }) {
  const p = useSharedValue(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!on || reduce) return;
    p.set(0.82);
    p.set(withSpring(1, { dampingRatio: 0.5, duration: 420 }));
  }, [on, reduce, p]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: p.get() }] }));
  return <Animated.View style={[s.tabIcon, a]}>{children}</Animated.View>;
}

/** The tablet's side rail: Shono's mark, then the pages, with the same gliding pill. */
function Rail({ tabs, cur, onTab, navRef }: { tabs: [Tab, string][]; cur: Tab; onTab: (t: Tab) => void; navRef: RefObject<ViewNode | null> }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const i = tabs.findIndex((t) => t[0] === cur);
  const y = useSharedValue(i * 70);
  useEffect(() => y.set(reduce ? i * 70 : withSpring(i * 70, SPRING)), [i, reduce, y]);
  const glide = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <View style={[s.rail, { paddingTop: insets.top + 18, backgroundColor: c.dark ? c.window : c.surface, borderRightColor: c.hair }]}>
      <Mark size={40} />
      <View ref={navRef} collapsable={false} accessibilityRole="tablist" style={s.railTabs}>
        <Animated.View pointerEvents="none" style={[s.railGlide, { backgroundColor: c.tint }, glide]} />
        {tabs.map(([k, label]) => {
          const on = k === cur;
          const color = on ? c.signalInk : c.ink2;
          return (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => {
                if (on) return;
                tick();
                onTab(k);
              }}
              style={s.railTab}
            >
              <Pop on={on}>
                <TabIcon tab={k} color={color} />
              </Pop>
              <Text style={[s.tabLabel, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function MobileApp() {
  const c = useColors();
  const b = useBudPilot();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  const wide = tablet && width >= 960; // landscape tablets keep the earbuds pane beside the page
  const tabs = tablet ? TABLET_TABS : PHONE_TABS;
  const [picked, setTab] = useState<Tab>("home");
  const cur = tabs.some((t) => t[0] === picked) ? picked : tabs[0][0]; // e.g. Home after turning a tablet
  const [last, setLast] = useState({ cur, prev: cur }); // the tab before, so a new page slides in from its side
  if (last.cur !== cur) setLast({ cur, prev: last.cur });
  const [appOpen, setAppOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(() => !!loadPref<boolean>(ONBOARDED_KEY));
  const [tour, setTour] = useState<TourStop[]>(); // the stops, while the tour runs
  const [msg, setMsg] = useState<Note>();
  useAutoConnect(onboarded);
  useKeeper(b, onboarded);
  const putBack = usePutBackNote(b);
  const note = msg && (!putBack || msg.at > putBack.at) ? msg : putBack;
  const reduce = useReducedMotion();

  // the tour: where each card is (scrolled into view first), on whichever layout is showing
  const homeRefs = useTourRefs(); // the phone's Home, or the tablet's earbuds pane
  const stripDevice = useRef<ViewNode>(null); // the portrait tablet's strip
  const stripNoise = useRef<ViewNode>(null);
  const homeScroll = useRef<ScrollNode>(null);
  const navRef = useRef<ViewNode>(null);
  const topPad = tablet ? insets.top + 18 : insets.top + 60;
  const card = (refs: TourRefs, key: "device" | "noise" | "eq" | "game", scroll: boolean) => async () => {
    const t = refs[key].current;
    const stack = refs.stack.current;
    if (scroll && t && stack) {
      homeScroll.current?.scrollTo({ y: Math.max(0, topPad + (await offsetIn(t, stack)) - 120), animated: !reduce });
      await sleep(reduce ? 60 : 450);
    }
    return inWindow(t);
  };
  const stop = (key: keyof typeof STOPS, locate: TourStop["locate"], radius?: number): TourStop => ({ title: STOPS[key][0], body: STOPS[key][1], locate, radius });
  // built when the tour starts (the stops find their cards then, through refs)
  const tourStops = (): TourStop[] =>
    tablet && !wide
      ? [stop("device", () => inWindow(stripDevice.current)), stop("noise", () => inWindow(stripNoise.current)), stop("rail", () => inWindow(navRef.current), 20)]
      : [
          stop("device", card(homeRefs, "device", true)),
          stop("noise", card(homeRefs, "noise", true)),
          stop("eq", card(homeRefs, "eq", true)),
          stop("game", card(homeRefs, "game", true)),
          tablet ? stop("rail", () => inWindow(navRef.current), 20) : stop("tabs", () => inWindow(navRef.current), 0),
        ];
  const startTour = () => {
    setAppOpen(false);
    setTab("home");
    setTimeout(() => setTour(tourStops()), 500);
  };
  const endTour = (finished: boolean) => {
    setTour(undefined);
    homeScroll.current?.scrollTo({ y: 0, animated: !reduce });
    setMsg({ title: finished ? "Tour finished" : "Tour skipped", sub: finished ? "Find it again in App settings" : "Take it any time from App settings", at: Date.now() });
  };
  const firstRunDone = (tour: boolean) => {
    savePref(ONBOARDED_KEY, true);
    setOnboarded(true);
    setTab("home");
    if (tour) setTimeout(() => setTour(tourStops()), 650);
    else setMsg({ title: "Tour skipped", sub: "Take it any time from App settings", at: Date.now() });
  };
  const firstRunAgain = () => {
    setAppOpen(false);
    savePref(ONBOARDED_KEY, false);
    setOnboarded(false);
  };

  // Back on a phone goes Home first, then leaves the app (sheets close themselves)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (tablet || cur === "home") return false;
      setTab("home");
      return true;
    });
    return () => sub.remove();
  }, [tablet, cur]);

  const ui = { tablet };
  const content = (k: Tab) =>
    ({
      home: <HomeCards b={b} onEdit={() => setTab("eq")} refs={homeRefs} />,
      sound: <SoundPage b={b} />,
      eq: <EqPage b={b} ui={ui} />,
      game: <GamePage b={b} />,
      touch: <TouchPage b={b} ui={ui} />,
      app: <AppContent b={b} onTour={startTour} onFirstRun={firstRunAgain} />,
    })[k];
  const iCur = tabs.findIndex((t) => t[0] === cur);
  const dirOf = (j: number) => (j === iCur ? Math.sign(j - tabs.findIndex((t) => t[0] === last.prev)) || 1 : Math.sign(j - iCur));

  return (
    <View style={[s.root, { backgroundColor: c.ground }]}>
      <StatusBar barStyle={c.dark ? "light-content" : "dark-content"} />
      {tablet ? (
        <View style={s.row}>
          <Rail tabs={tabs} cur={cur} onTab={setTab} navRef={navRef} />
          {wide && (
            <ScrollView ref={homeScroll} style={[s.pane, { borderRightColor: c.hair }]} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }}>
              <HomeCards b={b} onEdit={() => setTab("eq")} compact refs={homeRefs} />
            </ScrollView>
          )}
          <View style={s.grow}>
            {!wide && (
              <View style={[s.strip, { paddingTop: insets.top + 16, borderBottomColor: c.hair }]}>
                <View style={s.grow} ref={stripDevice} collapsable={false}>
                  <DeviceCard b={b} />
                </View>
                {b.status === "connected" && b.state && (
                  <View style={s.grow} ref={stripNoise} collapsable={false}>
                    <NoiseCard b={b} compact />
                  </View>
                )}
              </View>
            )}
            <View style={s.grow}>
              {tabs.map(([k], j) => (
                <Page key={k} active={k === cur} dir={dirOf(j)} title={TITLES[k]} lede={LEDES[k]} top={wide ? insets.top + 28 : 24} bottom={insets.bottom + 32}>
                  {content(k)}
                </Page>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <>
          {tabs.map(([k], j) => (
            <Page
              key={k}
              active={k === cur}
              dir={dirOf(j)}
              scrollRef={k === "home" ? homeScroll : undefined}
              title={k === "home" ? undefined : TITLES[k]}
              lede={LEDES[k]}
              top={insets.top + 60}
              bottom={insets.bottom + 96}
              bar={
                k === "home" ? (
                  <View style={s.homeBar}>
                    <Mark />
                    <Text style={[s.brand, { color: c.ink }]}>Shono</Text>
                    <View style={s.grow} />
                    <Pressable accessibilityRole="button" accessibilityLabel="App settings" hitSlop={6} onPress={() => setAppOpen(true)} style={s.gear}>
                      <GearIcon color={c.ink} size={22} />
                    </Pressable>
                  </View>
                ) : null
              }
            >
              {content(k)}
            </Page>
          ))}
          <TabBar tabs={tabs} cur={cur} onTab={setTab} navRef={navRef} />
          <Sheet open={appOpen} tablet={false} title="App" sub="Look and feel, and the earbuds Shono talks to." onClose={() => setAppOpen(false)}>
            <ScrollView style={{ maxHeight: height * 0.68 }} contentContainerStyle={{ paddingBottom: 8 }}>
              <AppContent b={b} onTour={startTour} onFirstRun={firstRunAgain} />
            </ScrollView>
          </Sheet>
        </>
      )}
      {tour && <Tour stops={tour} tablet={tablet} onEnd={endTour} />}
      {!onboarded && <Onboarding b={b} onDone={firstRunDone} />}
      <Toast note={note} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" }, // pages waiting to slide in sit just off-screen
  row: { flex: 1, flexDirection: "row" },
  grow: { flex: 1, minWidth: 0 },
  titles: { paddingHorizontal: 4, marginBottom: 14 },
  lede: { marginTop: 4, fontSize: 14 },
  bar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 20 },
  barTitle: { fontFamily: F.display, fontSize: 17 },
  homeBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, marginLeft: -4 },
  brand: { fontFamily: F.display, fontSize: 21, letterSpacing: -0.3 },
  gear: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -8 },
  tabbar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", paddingTop: 6, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth },
  glide: { position: "absolute", top: 10, left: 10, height: 32, alignItems: "center" },
  glidePill: { width: 58, height: 32, borderRadius: 16 },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingTop: 4, minHeight: 56 },
  tabIcon: { height: 32, width: 58, alignItems: "center", justifyContent: "center" },
  tabLabel: { fontFamily: F.medium, fontSize: 11.5 },
  rail: { width: 92, alignItems: "center", borderRightWidth: StyleSheet.hairlineWidth },
  railTabs: { marginTop: 22, width: "100%", alignItems: "center", gap: 6 },
  railGlide: { position: "absolute", top: 0, width: 60, height: 32, borderRadius: 16 },
  railTab: { height: 64, width: "100%", alignItems: "center", gap: 3 },
  pane: { width: 392, flexGrow: 0, borderRightWidth: StyleSheet.hairlineWidth },
  strip: { flexDirection: "row", gap: 12, paddingHorizontal: 24, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
