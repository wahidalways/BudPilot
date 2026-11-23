// The phone screens' icons, in the tab bar's iOS style (Ionicons): an outline at rest, filled when chosen. Where
// Ionicons has nothing that fits, one is drawn in its weight (32 on 512): the noise modes from Ionicons' own ear
// (Ionicons, MIT licence, © Ionic), Play/Pause in one, and a single earbud from the Home tab's pair (art.tsx).
// Design: artifacts/shono-icons.html.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import Svg, { G, Path } from "react-native-svg";

type Glyph = ComponentProps<typeof Ionicons>["name"];
type P = { color: string; size?: number; on?: boolean };

/** Ionicons' ear: the outline's three strokes, and the filled shape. */
export const EAR_OUTLINE = [
  "M335.72 330.76C381.73 299.5 416 251.34 416 192a160 160 0 00-320 0v206.57c0 44.26 35.74 81.43 80 81.43h0c44.26 0 66.83-25.94 77.29-40 14.77-19.81 41.71-81.56 82.43-109.24z",
  "M160 304V184c0-48.4 43.2-88 96-88h0c52.8 0 96 39.6 96 88",
  "M160 239c25-18 79.82-15 79.82-15 26 0 41.17 29.42 26 50.6 0 0-36.86 42.4-41.86 61.4",
];
const EAR_FILLED =
  "M256 16C159 16 80 95 80 192v206.57a97.59 97.59 0 0028 68.49A94.51 94.51 0 00176 496c36.86 0 67.18-15.62 90.12-46.42 4.48-6 9.55-14.74 15.42-24.85 15.32-26.37 36.29-62.47 63.17-80.74 25.77-17.51 47.23-39.54 62-63.72C423.51 252.94 432 223.24 432 192c0-97-78.95-176-176-176zm96 184a16 16 0 01-16-16c0-39.7-35.89-72-80-72s-80 32.3-80 72v30.42c27.19-7.84 58.4-6.72 64.28-6.42a48 48 0 0138.6 75.9c-.3.41-.61.81-.95 1.2-16.55 19-36 45.48-38.46 55a16 16 0 01-30.94-8.14c5.51-20.94 36.93-58.2 44.66-67.15A16 16 0 00239.82 240h-.88c-16.6-.89-45.89.8-62.94 8.31V304a16 16 0 01-32 0V184c0-57.35 50.24-104 112-104s112 46.65 112 104a16 16 0 01-16 16z";

/** Noise control: 0 Off (the ear), 1 ANC (a wall the room stops at), 2 Transparency (sound reaching the ear). ANC
 * and Transparency are wider (640 × 512): what comes in from the left needs room. */
export function NoiseGlyph({ mode, on, color, size = 26 }: P & { mode: number }) {
  const w = mode ? 640 : 512;
  return (
    <Svg width={(size * w) / 512} height={size} viewBox={`0 0 ${w} 512`} fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round">
      {mode === 1 && <Path d="M96 104a200 200 0 0 0 0 304" strokeWidth={56} />}
      {mode === 2 && <Path d="M118 196a76 76 0 0 0 0 120M62 140a150 150 0 0 0 0 232" />}
      <G transform={mode ? "translate(128 0)" : undefined}>
        {on ? <Path d={EAR_FILLED} fill={color} stroke="none" /> : EAR_OUTLINE.map((d) => <Path key={d} d={d} />)}
      </G>
    </Svg>
  );
}

/** Play/Pause in one (like SF's play.pause): a rounded triangle and two bars. */
export const PlayPauseGlyph = ({ on, color, size = 24 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 512 512" fill={on ? color : "none"} stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M64 140c0-16 17-25 30-17l150 104c12 8 12 26 0 34L94 365c-13 9-30-1-30-17Z" />
    <Path d="M336 128v256M432 128v256" strokeWidth={on ? 56 : 32} />
  </Svg>
);

// one bud of the Home tab's pair, moved to the middle; its speaker left open when filled
const BUD = "M8 12.24A4.5 4.5 0 1 1 11 8V19a1.5 1.5 0 0 1-3 0Z";
const SPEAKER = "M4 8a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0Z";
/** One earbud; `flip` for the right one. */
export const BudGlyph = ({ flip, on, color, size = 22 }: P & { flip?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <G transform={flip ? "translate(24 0) scale(-1 1)" : undefined}>
      <G transform="translate(5.5 0)">
        {on ? (
          <Path d={BUD + SPEAKER} fill={color} fillRule="evenodd" />
        ) : (
          <>
            <Path d={BUD} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
            <Path d={SPEAKER} fill={color} />
          </>
        )}
      </G>
    </G>
  </Svg>
);

// the earbuds' touch functions (codes from hoco.music): 0 nothing, 2 voice assistant, 3 previous, 4 next,
// 5 play/pause, 9 volume up, 10 volume down
const FN: Record<number, string> = { 2: "mic", 3: "play-skip-back", 4: "play-skip-forward", 9: "volume-high", 10: "volume-low" };
/** A touch function's icon, by the earbuds' code. */
export function FnGlyph({ fn, on, color, size = 24 }: P & { fn: number }) {
  if (fn === 5) return <PlayPauseGlyph on={on} color={color} size={size} />;
  const name = FN[fn] ?? "ban";
  return <Ionicons name={(on ? name : `${name}-outline`) as Glyph} size={size} color={color} />;
}
