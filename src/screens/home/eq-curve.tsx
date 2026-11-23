import { useRef, useState } from "react";
import { type GestureResponderEvent, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";

import { F, useColors } from "@/theme";
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
  /** every step while dragging (for the display) */
  onChange: (gains: number[]) => void;
  /** once per gesture or key press, when the curve should be sent */
  onCommit: (gains: number[]) => void;
  /** phones: drawn at this height and its real width, so labels and points keep their size (otherwise the 600 × 240
   * drawing scales to fit, as in the Windows app) */
  height?: number;
};

const L = 44; // room for the dB labels
const R = 20;
const T = 24;
const B = 36; // room for the band labels

const signed = (g: number) => (g > 0 ? `+${g}` : g < 0 ? `−${-g}` : "0"); // a real minus sign

/** The Custom EQ as one curve: drag a point, or focus the chart and use the arrow keys. */
export function EqCurve({
  bands,
  gains,
  max,
  faded,
  readOnly,
  onChange,
  onCommit,
  height,
}: Props) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const W = height ? Math.max(width, 1) : 600;
  const H = height ?? 240;
  const [focused, setFocused] = useState<number>();
  const drag = useRef<{
    band: number;
    left: number;
    top: number;
    last: number[];
    start: number[];
  }>(undefined);
  const n = bands.length;
  const x = (i: number) => L + 16 + (i * (W - L - R - 32)) / (n - 1); // inset: the first point clears the dB labels
  const y = (g: number) => T + ((max - g) * (H - T - B)) / (2 * max);
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

  const pts = gains.map((g, i) => [x(i), y(g)] as [number, number]);
  const curve = smoothPath(pts);
  const area = `${curve} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  const move = (e: GestureResponderEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = withBand(
      d.last,
      d.band,
      gainAt((e.nativeEvent.pageY - d.top) / scale),
    );
    if (next[d.band] === d.last[d.band]) return;
    d.last = next;
    onChange(next);
  };
  const release = () => {
    const d = drag.current;
    drag.current = undefined;
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
          <G>
            {[-max, 0, max].map((g) => (
              <G key={g}>
                <Line
                  x1={L}
                  x2={W - R}
                  y1={y(g)}
                  y2={y(g)}
                  stroke={g === 0 ? c.ink2 : c.hair}
                  strokeWidth={1}
                  strokeDasharray={g === 0 ? "3 4" : undefined}
                />
                <SvgText
                  x={L - 8}
                  y={y(g) + 4}
                  textAnchor="end"
                  fontFamily={F.regular}
                  fontSize={11}
                  fill={c.ink2}
                >
                  {signed(g)}
                </SvgText>
              </G>
            ))}
            {bands.map((name, i) => (
              <G key={name}>
                <Line
                  x1={x(i)}
                  x2={x(i)}
                  y1={T}
                  y2={H - B}
                  stroke={c.hair}
                  strokeWidth={1}
                />
                <SvgText
                  x={x(i)}
                  y={H - 12}
                  textAnchor="middle"
                  fontFamily={F.regular}
                  fontSize={11}
                  fill={c.ink2}
                >
                  {name}
                </SvgText>
              </G>
            ))}
          </G>
          <G opacity={faded ? 0.35 : 1}>
            <Path d={area} fill={c.tint} />
            <Path d={curve} fill="none" stroke={c.signal} strokeWidth={2.5} />
            {pts.map(([px, py], i) => (
              <G key={i}>
                <Circle
                  cx={px}
                  cy={py}
                  r={8}
                  fill={c.surface}
                  stroke={c.signal}
                  strokeWidth={focused === i ? 4 : 2.5}
                />
                {gains[i] !== 0 && (
                  <SvgText
                    x={px}
                    y={gains[i] < 0 ? py + 24 : py - 14} // cuts label below their point, clear of the 0 line
                    textAnchor="middle"
                    fontFamily={F.semibold}
                    fontSize={11}
                    fill={c.ink}
                  >
                    {signed(gains[i])}
                  </SvgText>
                )}
              </G>
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
            const { locationX, locationY, pageX, pageY } = e.nativeEvent;
            const b = nearest(locationX / scale);
            drag.current = {
              band: b,
              left: pageX - locationX,
              top: pageY - locationY,
              last: gains,
              start: gains,
            };
            setFocused(b);
            move(e);
          }}
          onResponderMove={move}
          onResponderRelease={release}
          onResponderTerminate={release}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%", aspectRatio: 600 / 240 },
});
