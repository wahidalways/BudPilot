// The phone and tablet app: tabs and pages that slide in from the side of the tab you picked (phones, and tablets held
// upright, in a column up to 760 wide, the Dashboard on Home), or on a tablet held sideways the Dashboard with every
// setting inline and App settings in a side panel (dashboard.tsx); the App sheet, and the note when Shono puts your
// noise setting back. The phone's
// bars are glass over the pages, so they sit outside the blur target that holds them. The top uses a collapsing title
// (the user's pick): nothing covers the top of a page, the gear stays put, and Frost glass fades in once you scroll.
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurTargetView } from "expo-blur";
import { NavigationBar } from "expo-navigation-bar";
import { type ComponentProps, type ComponentRef, memo, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type BudPilot, modeName, useBudPilot } from "@/screens/home/use-bud-pilot";
import { F, KeepColors, useColors, useTheme } from "@/theme";
import { seconds } from "@/utils/corrections";
import { later } from "@/utils/later";
import { loadPref, savePref } from "@/utils/prefs";

import { CaseGlyph } from "./art";
import { askBackgroundUnrestricted, backgroundUnrestricted } from "../../modules/shono-keeper";
import { FindPage } from "./find";
import { DashboardBoard, EDGE, SidePanel, TabletBar } from "./dashboard";
import { HomeCards, markWelcomed, type TourRefs } from "./home";
import { BluetoothGate } from "./bluetooth-gate";
import { Backdrop, FrostBar, Glass, groundOf, PageActive, useSurface } from "./glass";
import { useKeeper } from "./keeper";
import { Launch } from "./launch";
import { Onboarding, type Rect, Tour, type TourStop } from "./onboarding";
import { Button, GearButton, Mark, Press, TAGLINE, tick, Txt } from "./kit";
import { AppContent, EqPage, GamePage, SoundPage, TouchPage } from "./pages";
import { Sheet, Toast } from "./sheet";
import { UpdateSheet, useDailyUpdateCheck } from "./update";

type ViewNode = ComponentRef<typeof View>;
type ScrollNode = ComponentRef<typeof ScrollView>;
type Tab = "home" | "sound" | "eq" | "game" | "touch" | "find" | "app";
const PHONE_TABS: [Tab, string][] = [
  ["home", "Home"],
  ["sound", "Sound"],
  ["eq", "EQ"],
  ["game", "Game"],
  ["touch", "Touch"],
];
// a phone's pages: its tabs, and Find, which opens from Home (the Home tab stays lit there)
const PHONE_PAGES: [Tab, string][] = [...PHONE_TABS, ["find", "Find"]];
const COLUMN = 760; // an upright tablet's content column
const BAR = 64; // the top bar's height under the status bar (Material's; 56 crowded the title); the large titles sit on its middle line
const COLLAPSE = 44; // scrolling this far turns a page's large title into the bar's small one
const SMALL = 17; // the collapsed title's size
const TITLE_H = 40; // the large title's line, the same in the bar and in the page (where a gap holds its place)
const HOME_LIFT = 7; // Home's name rises this much to make room for the tagline under it
const TITLES: Record<Tab, string> = { home: "Shono", sound: "Sound", eq: "Equalizer", game: "Game", touch: "Touch controls", find: "Find my earbuds", app: "App" };
const LEDES: Partial<Record<Tab, string>> = {
  sound: "What the room sounds like in your ears.",
  game: "Lowest audio delay, for games and videos.",
  touch: "What each tap does. Saved on the earbuds.",
  find: "Play a sound, or see where they were last.",
  app: "Look and feel, and the earbuds Shono talks to.",
};

// Apple-style glyphs (Ionicons), as in iOS tab bars: an outline at rest, filled when chosen. Home is the earbuds' case
// (drawn in art.tsx to match; the user's pick): the page is about them, and the user didn't like a house.
type Glyph = ComponentProps<typeof Ionicons>["name"];
const GLYPHS: Record<Exclude<Tab, "home">, [Glyph, Glyph]> = {
  sound: ["ear-outline", "ear"],
  eq: ["options-outline", "options"],
  game: ["game-controller-outline", "game-controller"],
  touch: ["hand-left-outline", "hand-left"],
  find: ["location-outline", "location"],
  app: ["settings-outline", "settings"],
};
const TabIcon = ({ tab, on, color }: { tab: Tab; on: boolean; color: string }) =>
  tab === "home" ? <CaseGlyph on={on} color={color} size={26} /> : <Ionicons name={GLYPHS[tab][on ? 1 : 0]} size={25} color={color} />;

// What the Windows shell does every few seconds: connect whenever the earbuds are around. Not during the first run: its
// Connect step asks for Bluetooth access first, then connects.
function useAutoConnect(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const auto = () => (globalThis as { __budpilotAutoConnect?: () => void }).__budpilotAutoConnect?.();
    let cancel = () => {};
    const tick = () => {
      auto();
      cancel = later(tick, 5000);
    };
    tick();
    return () => cancel();
  }, [on]);
}


const ONBOARDED_KEY = "budpilot.onboarded";
const LIMITS_KEY = "budpilot.offeredUnlimited"; // "Run without limits" was offered once
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
  const touch = useRef<ViewNode>(null);
  return { stack, device, noise, eq, game, touch };
}
const STOPS = {
  device: ["Your earbuds", "Battery for each earbud and the case. A green number means it's charging."],
  noise: ["Noise control", "Choose Off, ANC or Transparency. ANC starts at Low; pick a stronger level just below it."],
  eq: ["Equalizer", "Tap a preset or one of your own EQs. Edit opens the full curve."],
  game: ["Game mode", "Cuts audio delay for games and videos. Game EQ can play while it's on."],
  touch: ["Touch controls", "What each tap on an earbud does. Tap one to change it; it's saved on the earbuds."],
  tabs: ["Everything else", "Sound, EQ, Game and Touch each have a tab. The gear holds theme, accent and this tour."],
  gear: ["Everything else", "Every setting is on this board. The gear holds theme, colour and this tour."],
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

/** A page out of sight keeps its last render: the earbuds' updates (every few seconds) re-render only the page on
 * screen. A new theme still reaches it (context passes through). */
const Still = memo(
  function Still({ children }: { active: boolean; children: ReactNode }) {
    return children;
  },
  (_, next) => !next.active,
);

/** A page: slides in from the side of its tab and fades. While it's the one showing, `barY` follows its scroll (the
 * phone's top bar fills in from it). `covered`: a sheet is over it, so its looping animations rest. */
function Page({
  active,
  covered,
  dir,
  title,
  lede,
  top,
  bottom,
  barY,
  titleInBar = true,
  scrollRef,
  edge = 16,
  children,
}: {
  active: boolean;
  covered: boolean;
  dir: number;
  title?: string;
  lede?: string;
  top: number;
  bottom: number;
  barY?: SharedValue<number>;
  titleInBar?: boolean;
  scrollRef?: RefObject<ScrollNode | null>;
  edge?: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [opened, setOpened] = useState(active); // built the first time it's shown (a faster start, less memory)
  if (active && !opened) setOpened(true);
  const p = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    p.set(reduce ? (active ? 1 : 0) : active ? withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }) : withTiming(0, { duration: 110 }));
  }, [active, reduce, p]);
  const move = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateX: (1 - p.get()) * dir * 22 }] }));
  const y = useSharedValue(0);
  const shown = useSharedValue(active);
  useEffect(() => {
    shown.set(active);
    if (active) barY?.set(y.get()); // the bar takes this page's scroll when you switch to it
  }, [active, shown, barY, y]);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
    if (shown.get()) barY?.set(e.contentOffset.y);
  });
  return (
    // its own colours: out of sight it keeps the ones it showed, and a new theme reaches it when it's shown again
    // covered (App settings open over it), it takes a new theme just after the sheet does
    <KeepColors live={active} defer={covered}>
    <Animated.View pointerEvents={active ? "auto" : "none"} accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"} style={[StyleSheet.absoluteFill, move]}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={barY ? onScroll : undefined}
        // no snapping to open or closed: it caught flings from the top and pulled the page back (the user). The title
        // simply follows the scroll and may rest half-collapsed.
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: edge }}
      >
        {barY && titleInBar && title ? (
          // the large title is drawn by the top bar, over this gap
          <View style={s.titles}>
            <View style={{ height: TITLE_H }} />
            {lede ? <Txt v="sub" style={s.lede}>{lede}</Txt> : null}
          </View>
        ) : title ? (
          <View style={s.titles}>
            <Txt v="big" accessibilityRole="header">
              {title}
            </Txt>
            {lede ? <Txt v="sub" style={s.lede}>{lede}</Txt> : null}
          </View>
        ) : null}
        <PageActive value={active && !covered}>
          {/* `active` too: the first render's own set can be dropped (see Sheet) */}
          <Still active={active}>{opened || active ? children : null}</Still>
        </PageActive>
      </Animated.ScrollView>
    </Animated.View>
    </KeepColors>
  );
}

/** The phone's top bar, a collapsing title that morphs: at the top of a page its large title sits at the left (on Home,
 * Shono's mark and name), with the gear at the right and no bar behind them. As you scroll, the title shrinks and glides
 * into the middle with your finger, Home's mark fades away, and Frost glass fades in behind. Transform and opacity
 * only, driven by the scroll on the UI thread. */
function TopBar({
  title,
  home,
  back,
  y,
  target,
  onGear,
  attention,
  edge = 16,
}: {
  title: string;
  home: boolean;
  back?: () => void;
  y: SharedValue<number>;
  target: RefObject<ViewNode | null>;
  onGear: () => void;
  attention: boolean;
  edge?: number;
}) {
  const c = useColors();
  const surface = useSurface();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const big = home ? 21 : 30; // Home's name is smaller beside its mark
  const inset = edge - 16; // an upright tablet's column starts further in
  const left = (home ? 58 : 20) + inset; // where the large title starts: the page's text edge, or after Home's mark
  const w = useSharedValue(0); // the large title's width, for centring it
  const fill = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [4, 22], [0, 1], "clamp") }));
  // Home's name sits a little above the middle line, its tagline under it, the pair centred on the mark; collapsing, the
  // name settles back onto the middle line
  const lift = home ? HOME_LIFT : 0;
  const morph = useAnimatedStyle(() => {
    const p = interpolate(y.get(), [0, COLLAPSE], [0, 1], "clamp");
    const k = 1 - p * (1 - SMALL / big);
    return { transform: [{ translateX: p * (width / 2 - left - (w.get() * k) / 2) }, { translateY: p * lift }, { scale: k }] };
  });
  const mark = useAnimatedStyle(() => {
    const p = interpolate(y.get(), [0, COLLAPSE * 0.6], [0, 1], "clamp");
    return { opacity: 1 - p, transform: [{ scale: 1 - p * 0.3 }] };
  });
  // with a Back row, the page keeps its large title; a small one fades in once it has scrolled under the bar
  const small = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [40, 64], [0, 1], "clamp"),
    transform: [{ translateY: interpolate(y.get(), [40, 64], [6, 0], "clamp") }],
  }));
  return (
    <View pointerEvents="box-none" style={[s.bar, { height: insets.top + BAR, paddingTop: insets.top, paddingRight: 18 + inset /* mirrors the mark */ }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fill]}>
        <FrostBar target={target} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {back ? (
        <>
          {/* a glass pill like the gear's, 18 in from the edge as the gear is on the other side (it sat 6 from the edge) */}
          <Press
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            hitSlop={8}
            scale={0.92}
            onPress={back}
            style={[s.back, { top: insets.top + (BAR - 36) / 2, left: 18 + inset, backgroundColor: surface.bg, borderColor: surface.edge }]}
          >
            <Ionicons name="chevron-back" size={18} color={c.ink} />
            <Text style={[s.backLabel, { color: c.ink }]}>Home</Text>
          </Press>
          <Animated.Text pointerEvents="none" numberOfLines={1} style={[s.smallTitle, { top: insets.top, color: c.ink }, small]}>
            {title}
          </Animated.Text>
        </>
      ) : null}
      {home && (
        <Animated.View pointerEvents="none" style={[s.barMark, { top: insets.top + (BAR - 30) / 2, left: 18 + inset }, mark]}>
          <Mark />
        </Animated.View>
      )}
      {back ? null : (
      <Animated.Text
        key={title}
        entering={FadeIn.duration(220)}
        pointerEvents="none"
        accessibilityRole="header"
        numberOfLines={1}
        onLayout={(e) => w.set(e.nativeEvent.layout.width)}
        style={[s.bigTitle, { left, top: insets.top + (BAR - TITLE_H) / 2 - lift, fontSize: big, letterSpacing: home ? -0.3 : -0.6, color: c.ink }, morph]}
      >
        {title}
      </Animated.Text>
      )}
      {home && (
        // the tagline under Shono's name (the user: "the logo needs a subtitle"); it leaves with the mark on scrolling
        <Animated.Text pointerEvents="none" numberOfLines={1} style={[s.barTag, { left, top: insets.top + BAR / 2 + 5, color: c.ink2 }, mark]}>
          {TAGLINE}
        </Animated.Text>
      )}
      <GearButton onPress={onGear} attention={attention} />
    </View>
  );
}

/** The phone's tab bar (the Edge bar): full-width glass over the page with a crisp hairline on top. The chosen tab is
 * in the accent with its icon filled in, and the icon pops; the others are dark outlines. The glass is denser than the
 * cards: Android's blur can't lift colour the way iOS's does, so a thin milky tint read as a grey haze (the user:
 * "washed out"). */
function TabBar({
  tabs,
  cur,
  lit,
  onTab,
  navRef,
  target,
}: {
  tabs: [Tab, string][];
  cur: Tab;
  lit: Tab;
  onTab: (t: Tab) => void;
  navRef: RefObject<ViewNode | null>;
  target: RefObject<ViewNode | null>;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const pick = c.dark ? c.signalInk : c.signal;
  const rest = c.dark ? "rgba(236, 238, 243, 0.74)" : "rgba(21, 24, 32, 0.74)"; // the other tabs: ink, a step back
  return (
    <View ref={navRef} collapsable={false} accessibilityRole="tablist" style={[s.tabbar, { paddingBottom: insets.bottom + 10 }]}>
      <Glass target={target} radius={0} flat fill={c.dark ? "rgba(16, 17, 20, 0.88)" : "rgba(252, 252, 254, 0.86)"} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[s.rim, { backgroundColor: c.dark ? "rgba(255, 255, 255, 0.1)" : "rgba(20, 30, 50, 0.1)" }]} />
      <View style={s.tabs}>
        {tabs.map(([k, label]) => {
        const on = k === lit;
        const color = on ? pick : rest;
        return (
          <Press
            key={k}
            scale={0.9}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            onPress={() => {
              if (k === cur) return;
              tick();
              onTab(k);
            }}
            style={s.tab}
          >
            <Pop on={on}>
              <TabIcon tab={k} on={on} color={color} />
            </Pop>
            <Text style={[s.tabLabel, { color }, on && s.tabLabelOn]}>{label}</Text>
          </Press>
        );
        })}
      </View>
    </View>
  );
}

/** Springs its child up from a little smaller when it becomes chosen. */
function Pop({ on, children }: { on: boolean; children: ReactNode }) {
  const p = useSharedValue(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!on || reduce) return;
    p.set(0.84);
    p.set(withSpring(1, { dampingRatio: 0.45, duration: 320 }));
  }, [on, reduce, p]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: p.get() }] }));
  return <Animated.View style={[s.tabIcon, a]}>{children}</Animated.View>;
}

// The look's few app-wide parts, each in its own small component: when MobileApp read the theme itself, every change of
// theme, accent, full screen, glass or battery bars re-rendered the whole app from the top.

/** The status and navigation bars: hidden in Full screen, the status bar's icons light or dark with the theme. */
function SystemBars() {
  const { c, look } = useTheme();
  const full = look.fullScreen !== false;
  return (
    <>
      <StatusBar hidden={full} barStyle={c.dark ? "light-content" : "dark-content"} />
      <NavigationBar hidden={full} />
    </>
  );
}

/** The app's ground colour behind everything (`children` are MobileApp's, so a new theme doesn't re-render them). */
function Ground({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={[s.root, { backgroundColor: groundOf(c) }]}>{children}</View>;
}

/** What the bars blur: everything under them, on the ground colour. */
function GroundTarget({ ref, children }: { ref: RefObject<ViewNode | null>; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <BlurTargetView ref={ref} style={[StyleSheet.absoluteFill, { backgroundColor: groundOf(c) }]}>
      {children}
    </BlurTargetView>
  );
}

export function MobileApp() {
  const b = useBudPilot();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  const sideways = tablet && width > height; // the board on one screen; held upright, a tablet works like a phone
  const edge = tablet ? Math.max(24, Math.round((width - COLUMN) / 2)) : 16;
  const tabs = PHONE_TABS;
  const pages = PHONE_PAGES;
  const [cur, setTab] = useState<Tab>("home");
  const [last, setLast] = useState({ cur, prev: cur }); // the tab before, so a new page slides in from its side
  if (last.cur !== cur) setLast({ cur, prev: last.cur });
  const [panel, setPanel] = useState(false); // sideways: App settings over the board
  const [appOpen, setAppOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(() => !!loadPref<boolean>(ONBOARDED_KEY));
  const [tour, setTour] = useState<TourStop[]>(); // the stops, while the tour runs
  const [msg, setMsg] = useState<Note>();
  const [launching, setLaunching] = useState(true); // the loading screen, at a cold start (launch.tsx)
  const launched = useCallback(() => setLaunching(false), []);
  // after a drop the relink loop goes first (see use-earbuds). Not before Android has said where the earbuds' sound is,
  // and not while it's on another device (in the case, or playing elsewhere): their sound arriving connects at once
  // (use-earbuds), so a try every 5 s there only woke Shono 720 times an hour
  useAutoConnect(onboarded && b.status !== "connected" && b.soundChecked && b.pcLinked !== false);
  useDailyUpdateCheck(onboarded && !tour);
  const keeperOn = useKeeper(b, onboarded);
  // the gear's dot: Shono keeps working in the background, but Android may pause it there ("Run without limits" off)
  const [free, setFree] = useState(backgroundUnrestricted);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && setFree(backgroundUnrestricted()));
    return () => sub.remove();
  }, []);
  const attention = keeperOn && !free;
  const putBack = usePutBackNote(b);
  const note = msg && (!putBack || msg.at > putBack.at) ? msg : putBack;
  const reduce = useReducedMotion();

  // the tour: where each card is (scrolled into view first), on whichever layout is showing
  const homeRefs = useTourRefs(); // the phone's Home, or the tablet's Dashboard
  const homeScroll = useRef<ScrollNode>(null);
  const navRef = useRef<ViewNode>(null); // the tab bar, or sideways the gear
  const glassTarget = useRef<ViewNode>(null); // what the bars blur: everything under them
  const barY = useSharedValue(0); // how far the page showing has scrolled
  const topPad = insets.top + (BAR - TITLE_H) / 2; // the page's title gap lines up with the bar's title
  // a card already in view is shown at once; otherwise it's scrolled into view first (the tour used to scroll and
  // wait half a second at every stop: the user, "it takes a second before it moves")
  const card = (key: "device" | "noise" | "eq" | "game" | "touch") => async () => {
    const t = homeRefs[key].current;
    const stack = homeRefs.stack.current;
    const now = await inWindow(t);
    const top = insets.top + (sideways ? 76 : BAR);
    const bottom = height - insets.bottom - (sideways ? 8 : 80); // above the tab bar
    // in view: all of it, or at least its top 200 (a tall card can't show whole; the spotlight needs no more)
    if (now && now.y >= top - 8 && now.y + Math.min(now.h, 200) <= bottom + 8) return now;
    if (t && stack) {
      homeScroll.current?.scrollTo({ y: Math.max(0, (sideways ? 0 : topPad) + (await offsetIn(t, stack)) - 120), animated: !reduce });
      await sleep(reduce ? 40 : 300);
    }
    return inWindow(t);
  };
  const stop = (key: keyof typeof STOPS, locate: TourStop["locate"], radius?: number): TourStop => ({ title: STOPS[key][0], body: STOPS[key][1], locate, radius });
  // built when the tour starts (the stops find their cards then, through refs)
  const tourStops = (): TourStop[] => [
    stop("device", card("device")),
    stop("noise", card("noise")),
    stop("eq", card("eq")),
    stop("game", card("game")),
    ...(tablet ? [stop("touch", card("touch"))] : []),
    sideways ? stop("gear", () => inWindow(navRef.current), 24) : stop("tabs", () => inWindow(navRef.current), 0),
  ];
  const startTour = () => {
    setAppOpen(false);
    setPanel(false);
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
    markWelcomed();
    setOnboarded(true);
    setTab("home");
    if (tour) setTimeout(() => setTour(tourStops()), 650);
    else setMsg({ title: "Tour skipped", sub: "Take it any time from App settings", at: Date.now() });
  };
  // a tablet turned between upright (phone layout) and sideways (the Dashboard): the tour's stops were measured on the
  // other layout, and an open App sheet or side panel belongs to it, so they close rather than point at nothing or pop
  // open again on turning back
  const [layout, setLayout] = useState(sideways);
  if (layout !== sideways) {
    setLayout(sideways);
    setTour(undefined);
    setAppOpen(false);
    setPanel(false);
  }
  const firstRunAgain = () => {
    setAppOpen(false);
    setPanel(false);
    savePref(ONBOARDED_KEY, false);
    setOnboarded(false);
  };

  // "Run without limits", offered once: the first time Shono's background service runs (Keep my noise setting or Last
  // seen), not during the tour. Android may otherwise pause Shono in the background. Always in App settings too.
  const [limitsAsk, setLimitsAsk] = useState(false);
  useEffect(() => {
    if (!keeperOn || tour || loadPref<boolean>(LIMITS_KEY) || backgroundUnrestricted()) return;
    return later(() => {
      savePref(LIMITS_KEY, true);
      setLimitsAsk(true);
    }, 1500);
  }, [keeperOn, tour]);

  // Back closes the side panel (sideways), or goes Home first (phones, upright tablets), then leaves the app; sheets
  // close themselves
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (sideways) {
        if (!panel) return false;
        setPanel(false);
        return true;
      }
      if (cur === "home") return false;
      setTab("home");
      return true;
    });
    return () => sub.remove();
  }, [sideways, panel, cur]);

  const ui = { tablet };
  const content = (k: Tab) =>
    ({
      home: (
        <>
          <View style={{ height: TITLE_H, marginBottom: 12 }} /* the top bar draws Home's mark and name over this */ />
          {tablet ? (
            <DashboardBoard b={b} sideways={false} width={width} refs={homeRefs} tablet />
          ) : (
            <HomeCards b={b} onEdit={() => setTab("eq")} onFind={() => setTab("find")} onGame={() => setTab("game")} refs={homeRefs} />
          )}
        </>
      ),
      sound: <SoundPage b={b} />,
      eq: <EqPage b={b} ui={ui} />,
      game: <GamePage b={b} />,
      touch: <TouchPage b={b} ui={ui} />,
      find: <FindPage b={b} wide={tablet && !sideways} />,
      app: <AppContent b={b} onTour={startTour} onFirstRun={firstRunAgain} />,
    })[k];
  const iCur = pages.findIndex((t) => t[0] === cur);
  const dirOf = (j: number) => (j === iCur ? Math.sign(j - pages.findIndex((t) => t[0] === last.prev)) || 1 : Math.sign(j - iCur));
  const board = width - 2 * EDGE - insets.left - insets.right; // sideways: the board's width

  return (
    <Ground>
      <SystemBars />
      <GroundTarget ref={glassTarget}>
        {/* no colours around the pages: each page takes its own (see ThemeProvider's `scoped`) */}
        <KeepColors>
          <Backdrop shift={sideways ? 0 : iCur} />
        </KeepColors>
        {sideways ? (
          <KeepColors defer={panel || !onboarded /* App settings or the first run over it */}>
          {/* the board's loops rest while something covers it, as a page's do */}
          <PageActive value={!panel && !limitsAsk && !tour && onboarded}>
          <View style={s.grow}>
            <TabletBar b={b} onGear={() => setPanel(true)} gearRef={navRef} attention={attention} />
            <ScrollView
              ref={homeScroll}
              contentContainerStyle={{ paddingLeft: EDGE + insets.left, paddingRight: EDGE + insets.right, paddingTop: 4, paddingBottom: insets.bottom + 24 }}
            >
              <DashboardBoard b={b} sideways width={board} refs={homeRefs} tablet />
            </ScrollView>
          </View>
          </PageActive>
          </KeepColors>
        ) : (
          pages.map(([k], j) => (
            <Page
              key={k}
              active={k === cur}
              covered={appOpen || limitsAsk || !!tour || !onboarded /* the first run's screens */}
              dir={dirOf(j)}
              scrollRef={k === "home" ? homeScroll : undefined}
              title={k === "home" ? undefined : TITLES[k]}
              lede={LEDES[k]}
              top={k === "find" ? insets.top + BAR + 4 : topPad /* Find's title sits under its Back row */}
              bottom={insets.bottom + 96}
              barY={barY}
              titleInBar={k !== "find"}
              edge={edge}
            >
              {content(k)}
            </Page>
          ))
        )}
      </GroundTarget>
      <KeepColors>
      {sideways ? (
        <SidePanel open={panel} title={TITLES.app} lede={LEDES.app} onClose={() => setPanel(false)} target={glassTarget}>
          <AppContent b={b} onTour={startTour} onFirstRun={firstRunAgain} />
        </SidePanel>
      ) : (
        <>
          <TopBar title={TITLES[cur]} home={cur === "home"} back={cur === "find" ? () => setTab("home") : undefined} y={barY} target={glassTarget} onGear={() => setAppOpen(true)} attention={attention} edge={edge} />
          <TabBar tabs={tabs} cur={cur} lit={cur === "find" ? "home" : cur} onTab={setTab} navRef={navRef} target={glassTarget} />
          <Sheet open={appOpen} tablet={tablet} title="App" sub="Look and feel, and the earbuds Shono talks to." onClose={() => setAppOpen(false)}>
            <ScrollView style={{ maxHeight: height * (tablet ? 0.56 : 0.68) }} contentContainerStyle={{ paddingBottom: 8 }}>
              <AppContent b={b} onTour={startTour} onFirstRun={firstRunAgain} />
            </ScrollView>
          </Sheet>
        </>
      )}
      <Sheet
        open={limitsAsk}
        tablet={tablet}
        title="Let Shono run without limits?"
        sub="So your phone doesn't pause Shono in the background, where it keeps your noise setting and notes Last seen. Android asks next. You can change it any time in App settings."
        onClose={() => setLimitsAsk(false)}
      >
        <View style={s.sheetBtns}>
          <Button
            label="Continue"
            kind="pri"
            onPress={() => {
              setLimitsAsk(false);
              askBackgroundUnrestricted();
            }}
          />
          <Button label="Not now" kind="out" onPress={() => setLimitsAsk(false)} />
        </View>
      </Sheet>
      {tour && <Tour stops={tour} tablet={tablet} onEnd={endTour} />}
      {!onboarded && <Onboarding b={b} onDone={firstRunDone} />}
      <BluetoothGate onBack={() => !onboarded && b.status === "idle" && void b.connect()} />
      <UpdateSheet tablet={tablet} />
      <Toast note={note} />
      {/* ready once connected, or once it's clear they won't be soon (their sound is elsewhere: in the case, or on
          another device), so the logo doesn't hold the full 1.3 s for nothing */}
      {launching && <Launch ready={!onboarded || b.status === "connected" || b.pcLinked === false} onGone={launched} />}
      </KeepColors>
    </Ground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" }, // pages waiting to slide in sit just off-screen
  grow: { flex: 1, minWidth: 0 },
  titles: { paddingHorizontal: 4, marginBottom: 14 },
  lede: { marginTop: 4, fontSize: 14 },
  bar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 10 },
  barTag: { position: "absolute", fontFamily: F.medium, fontSize: 11.5, lineHeight: 14, transformOrigin: "left center" },
  bigTitle: { position: "absolute", height: TITLE_H, lineHeight: TITLE_H, fontFamily: F.display, transformOrigin: "left center" },
  barMark: { position: "absolute", left: 18 },
  sheetBtns: { gap: 10, paddingTop: 4 },
  back: { position: "absolute", height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 8, paddingRight: 14 },
  backLabel: { fontFamily: F.semibold, fontSize: 14.5 },
  smallTitle: { position: "absolute", left: 96, right: 96, height: BAR, lineHeight: BAR, textAlign: "center", fontFamily: F.display, fontSize: 17 },
  tabbar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "center", paddingTop: 8, paddingHorizontal: 6 },
  tabs: { flex: 1, flexDirection: "row", maxWidth: 560 },
  rim: { position: "absolute", top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth }, // a crisp top edge
  tab: { flex: 1, alignItems: "center", gap: 3, paddingTop: 4, minHeight: 56 },
  tabIcon: { height: 32, width: 58, alignItems: "center", justifyContent: "center" },
  tabLabel: { fontFamily: F.medium, fontSize: 11.5, letterSpacing: 0.1 },
  tabLabelOn: { fontFamily: F.semibold },
});
