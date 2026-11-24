import { memo, useId, useRef, useState } from "react";
import { type GestureResponderEvent, Platform, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import { type Colors, F, useColors } from "@/theme";
import { smoothPath } from "@/utils/eq-path";

type Props = {
  bands: string[];
  gains: number[];
  /** dB either side of 0 */
  max: number;
  /** a preset is playing: the curve (your Custom) shows faded */
  faded: boolean;
  /** shown, not edited (the built-in Game EQ) */
  readOnly?: boolean;
  /** once per gesture or key press, when the curve should be sent */
  onCommit: (gains: number[]) => void;
  /** each dB a drag moves a point (the phone's haptic tick) */
  onStep?: () => void;
  /** a point was touched: the phone's stepper then adjusts that band */
  onPick?: (band: number) => void;
  /** phones: drawn at this height and its real width, so labels and points keep their size (otherwise the 600 × 240
   * drawing scales to fit, as in the Windows app) */
  height?: number;
};

const T = 24;
const B = 36; // room for the band labels
// a finger moves the point it picked by as much as the finger moves, so grabbing a point a little off doesn't change it
// and a tap only picks it; a mouse puts the point where you click (Windows)
const RELATIVE = Platform.OS !== "web";

const signed = (g: number) => (g > 0 ? `+${g}` : g < 0 ? `−${-g}` : "0"); // a real minus sign

/** The Custom EQ as one curve: drag a point, or focus the chart and use the arrow keys. */
export function EqCurve({
  bands,
  gains,
  max,
  faded,
  readOnly,
  onCommit,
  onStep,
  onPick,
  height,
}: Props) {
  const c = useColors();
  const fillId = `eqfill${useId().replace(/[^a-zA-Z0-9]/g, "")}`; // one per chart (an id must be unique on a web page)
  const [width, setWidth] = useState(0);
  const W = height ? Math.max(width, 1) : 600;
  const H = height ?? 240;
  // phones: slimmer margins, so the bands sit as far apart as the width allows (a finger picks the nearest one)
  const L = height ? 34 : 44; // room for the dB labels
  const R = height ? 6 : 20;
  const IN = height ? 12 : 16; // the first point clears the dB labels
  const [focused, setFocused] = useState<number>();
  // a drag's curve while it lasts: only the chart re-renders on each step, not the page around it (that re-rendered
  // the whole EQ page per dB and made the point lag the finger); the page hears once, when the finger lifts
  const [live, setLive] = useState<number[]>();
  const [active, setActive] = useState<number>(); // the band being dragged
  const drag = useRef<{
    band: number;
    top: number;
    y0: number;
    g0: number;
    last: number[];
    start: number[];
  }>(undefined);
  const n = bands.length;
  const shown = live ?? gains;
  const x = (i: number) => L + IN + (i * (W - L - R - 2 * IN)) / (n - 1);
  const y = (g: number) => T + ((max - g) * (H - T - B)) / (2 * max);
  const dB = (H - T - B) / (2 * max); // one dB, in drawing units
  const scale = width / W || 1;
  const clamp = (g: number) => Math.max(-max, Math.min(max, g));
  const gainAt = (vy: number) =>
    clamp(Math.round(max - ((vy - T) / (H - T - B)) * 2 * max));
  const nearest = (vx: number) =>
    bands.reduce(
      (best, _, i) => (Math.abs(x(i) - vx) < Math.abs(x(best) - vx) ? i : best),
      0,
    );
  const withBand = (g: number[], i: number, v: number) =>
    g.map((old, j) => (j === i ? v : old));

  const pts = shown.map((g, i) => [x(i), y(g)] as [number, number]);
  const curve = smoothPath(pts);
  const area = `${curve} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  const move = (e: GestureResponderEvent) => {
    const d = drag.current;
    if (!d) return;
    const { pageY } = e.nativeEvent;
    const v = RELATIVE ? clamp(Math.round(d.g0 - (pageY - d.y0) / scale / dB)) : gainAt((pageY - d.top) / scale);
    if (v === d.last[d.band]) return;
    d.last = withBand(d.last, d.band, v);
    setLive(d.last);
    onStep?.();
  };
  const release = () => {
    const d = drag.current;
    drag.current = undefined;
    setActive(undefined);
    setLive(undefined); // in the same render as the page's new curve (onCommit), so it never flashes back
    if (d) onPick?.(d.band); // on lifting, with the curve: the page around re-renders once per touch, not as it starts
    if (d && d.last[d.band] !== d.start[d.band]) onCommit(d.last);
  };
  const key = (e: { key: string; preventDefault(): void }) => {
    const band = focused ?? 0;
    const step = ({ ArrowUp: 1, ArrowDown: -1 } as Record<string, number>)[
      e.key
    ];
    const hop = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[
      e.key
    ];
    if (hop) setFocused(Math.max(0, Math.min(n - 1, band + hop)));
    else if (step) {
      const v = clamp(gains[band] + step);
      if (v !== gains[band]) onCommit(withBand(gains, band, v));
    } else return;
    e.preventDefault();
  };
  const band = focused ?? 0;

  return (
    <View
      style={height ? { width: "100%", height } : s.wrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {(!height || width > 0) && (
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          <Grid W={W} H={H} L={L} R={R} IN={IN} max={max} bands={bands} c={c} />
          <Defs>
            {/* the accent, strongest at the chart's top and bottom, fading out at the 0 line: boosts and cuts glow */}
            <LinearGradient id={fillId} x1="0" y1={T} x2="0" y2={H - B} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={c.signal} stopOpacity={0.34} />
              <Stop offset="0.5" stopColor={c.signal} stopOpacity={0.03} />
              <Stop offset="1" stopColor={c.signal} stopOpacity={0.34} />
            </LinearGradient>
          </Defs>
          <G opacity={faded ? 0.35 : 1}>
            <Path d={area} fill={`url(#${fillId})`} />
            <Path d={curve} fill="none" stroke={c.signal} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            {pts.map(([px, py], i) => (
              <Point key={i} px={px} py={py} g={shown[i]} on={i === active} ring={focused === i} phone={!!height} floor={H - B} c={c} />
            ))}
          </G>
        </Svg>
      )}
      {!readOnly && (
        <View
          style={StyleSheet.absoluteFill}
          accessible
          focusable
          accessibilityRole="adjustable"
          accessibilityLabel={`Custom EQ, ${bands[band]} hertz`}
          accessibilityHint="Left and right pick a band; up and down change it"
          accessibilityValue={{
            min: -max,
            max,
            now: gains[band],
            text: `${signed(gains[band])} dB`,
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) =>
            key({
              key:
                e.nativeEvent.actionName === "increment"
                  ? "ArrowUp"
                  : "ArrowDown",
              preventDefault() {},
            })
          }
          // web keyboard (react-native-web forwards these)
          {...({
            onKeyDown: key,
            onFocus: () => setFocused((f) => f ?? 0),
            onBlur: () => setFocused(undefined),
          } as object)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => {
            const { locationX, locationY, pageY } = e.nativeEvent;
            const b = nearest(locationX / scale);
            drag.current = {
              band: b,
              top: pageY - locationY,
              y0: pageY,
              g0: gains[b],
              last: gains,
              start: gains,
            };
            setFocused(b);
            setActive(b);
            if (!RELATIVE) move(e);
            return true; // Android: the page's scroll view mustn't take the drag over halfway (it stalled the point)
          }}
          onResponderMove={move}
          onResponderRelease={release}
          onResponderTerminate={release}
        />
      )}
    </View>
  );
}

/** The chart's fixed parts: the 0 and ±max lines, a line per band, and every label. Memoised, so a drag step leaves
 * them alone (they were most of what each step re-rendered). */
const Grid = memo(function Grid({ W, H, L, R, IN, max, bands, c }: { W: number; H: number; L: number; R: number; IN: number; max: number; bands: string[]; c: Colors }) {
  const x = (i: number) => L + IN + (i * (W - L - R - 2 * IN)) / (bands.length - 1);
  const y = (g: number) => T + ((max - g) * (H - T - B)) / (2 * max);
  return (
    <G>
      {[-max, 0, max].map((g) => (
        <G key={g}>
          <Line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke={g === 0 ? c.ink2 : c.hair} strokeWidth={1} strokeDasharray={g === 0 ? "3 4" : undefined} />
          <SvgText x={L - 8} y={y(g) + 4} textAnchor="end" fontFamily={F.regular} fontSize={11} fill={c.ink2}>
            {signed(g)}
          </SvgText>
        </G>
      ))}
      {bands.map((name, i) => (
        <G key={name}>
          <Line x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke={c.hair} strokeWidth={1} />
          <SvgText x={x(i)} y={H - 12} textAnchor="middle" fontFamily={F.regular} fontSize={11} fill={c.ink2}>
            {name}
          </SvgText>
        </G>
      ))}
    </G>
  );
});

/** One band's point and its value. Memoised: a drag step re-renders only the point that moved. `on`: in the finger
 * (bigger, filled); `ring`: picked (the stepper's band, or the keyboard's). */
const Point = memo(function Point({ px, py, g, on, ring, phone, floor, c }: { px: number; py: number; g: number; on: boolean; ring: boolean; phone: boolean; floor: number; c: Colors }) {
  const r = on ? 11 : phone ? 9 : 8;
  return (
    <G>
      <Circle cx={px} cy={py} r={r} fill={on ? c.signal : c.surface} stroke={on ? c.surface : c.signal} strokeWidth={on ? 3 : ring ? 4 : 2.5} />
      {(g !== 0 || on) && (
        <SvgText
          x={px}
          // a cut's label goes below its point, clear of the 0 line; near the bottom it goes above, clear of the band names
          y={g < 0 && py + 18 <= floor ? py + r + 16 : py - r - 6}
          textAnchor="middle"
          fontFamily={F.semibold}
          fontSize={on ? 13 : 11}
          fill={on ? c.signalInk : c.ink}
        >
          {signed(g)}
        </SvgText>
      )}
    </G>
  );
});

const s = StyleSheet.create({
  wrap: { width: "100%", aspectRatio: 600 / 240 },
});
