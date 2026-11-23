import type { ReactNode } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

type P = { color: string; size?: number; strokeWidth?: number };

/** A 24×24 line icon, drawn like the redesign's. */
function Line({ color, size = 18, strokeWidth = 1.7, children }: P & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

// an open ear (rim and inner curl; a closed outline read as a light bulb), on the right to leave room for sound
const EAR = "M9.5 9a5.5 5.5 0 0 1 11 0c0 3.4-2.6 4.6-3.4 6.2-.7 1.5-.9 4.3-3.6 4.3a2.6 2.6 0 0 1-2.6-2.6M12.5 9.5a2.5 2.5 0 0 1 5 0c0 1.6-1.4 2-2 3.2";

/** Noise control pictures: 0 off, 1 noise cancelling (a wall), 2 transparency (sound coming in). */
export function NoiseIcon({ mode, ...p }: P & { mode: number }) {
  return (
    <Line {...p} size={p.size ?? 26} strokeWidth={1.6}>
      <Path d={EAR} />
      {mode === 1 && <Path d="M5.5 5a10 10 0 0 0 0 13" strokeWidth={2.6} />}
      {mode === 2 && <Path d="M6.5 9a3.5 3.5 0 0 0 0 5M4 7a7 7 0 0 0 0 9" />}
    </Line>
  );
}

/** Shono's mark: two earbuds. */
export const BudsIcon = (p: P) => (
  <Line {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <Path d="M7 4a4 4 0 0 0-1 7.9V19a2 2 0 0 0 4 0v-6.5A4 4 0 0 0 7 4Z" />
    <Path d="M17 4a4 4 0 0 1 1 7.9V19a2 2 0 0 1-4 0v-6.5A4 4 0 0 1 17 4Z" />
  </Line>
);

/** One earbud; `flip` for the right one. */
export const BudIcon = ({ flip, ...p }: P & { flip?: boolean }) => (
  <Line {...p}>
    <Path d="M12 4a4 4 0 0 0-1 7.9V19a2 2 0 0 0 4 0v-6.5A4 4 0 0 0 12 4Z" transform={flip ? "matrix(-1 0 0 1 24 0)" : undefined} />
  </Line>
);

export const GearIcon = (p: P) => (
  <Line {...p}>
    <Circle cx={12} cy={12} r={3} />
    <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Line>
);

/** The settings rail. */
export function NavIcon({ panel, ...p }: P & { panel: string }) {
  return (
    <Line {...p}>
      {panel === "sound" && <Path d={EAR} transform="translate(-3 0)" />}
      {panel === "eq" && (
        <>
          <Path d="M5 4v16M12 4v16M19 4v16" />
          <Circle cx={5} cy={14} r={2} fill={p.color} />
          <Circle cx={12} cy={8} r={2} fill={p.color} />
          <Circle cx={19} cy={15} r={2} fill={p.color} />
        </>
      )}
      {panel === "game" && (
        <>
          <Rect x={2.5} y={7} width={19} height={11} rx={5.5} />
          <Path d="M7.5 10.5v4M5.5 12.5h4" />
          <Circle cx={16} cy={11.5} r={1} />
          <Circle cx={18} cy={13.5} r={1} />
        </>
      )}
      {panel === "touch" && (
        <>
          <Path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
          <Path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2" />
          <Path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.6 15a1.5 1.5 0 0 1 2.4-1.8L9 15" />
        </>
      )}
      {panel === "app" && (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={2.5} />
          <Path d="M3 9h18" />
        </>
      )}
    </Line>
  );
}

const FN: Record<number, string> = {
  5: "M5 5v14l8-7ZM16 5v14M20 5v14", // play/pause
  9: "M4 9v6h4l5 4V5L8 9ZM17 12h5M19.5 9.5v5", // volume up
  10: "M4 9v6h4l5 4V5L8 9ZM17 12h5", // volume down
  3: "M18 5v14L8 12ZM6 5v14", // previous
  4: "M6 5v14l10-7ZM18 5v14", // next
  0: "M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0M6.5 17.5l11-11", // none
};

/** Touch functions, by the earbuds' code. */
export function FnIcon({ fn, ...p }: P & { fn: number }) {
  if (fn === 2)
    return (
      <Line {...p}>
        <Rect x={9} y={3} width={6} height={11} rx={3} />
        <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </Line>
    );
  return (
    <Line {...p}>
      <Path d={FN[fn] ?? FN[0]} />
    </Line>
  );
}

/** A small › for the Game mode turbo light. */
export const ChevronIcon = ({ color }: { color: string }) => (
  <Svg width={6} height={10} viewBox="0 0 6 10" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M1.2 1.2 4.8 5 1.2 8.8" />
  </Svg>
);

export const BoltIcon = ({ color }: { color: string }) => (
  <Svg width={8} height={11} viewBox="0 0 8 11">
    <Path d="M4.6 0 0 6.2h3.1L2.6 11 8 4.6H4.9L5.6 0Z" fill={color} />
  </Svg>
);

/** Window buttons, drawn thin like Windows 11's. */
export function WindowIcon({ kind, color }: { kind: "minimize" | "maximize" | "close"; color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth={1}>
      {kind === "minimize" && <Path d="M0 5.5h10" />}
      {kind === "maximize" && <Rect x={0.5} y={0.5} width={9} height={9} rx={1.5} />}
      {kind === "close" && <Path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />}
    </Svg>
  );
}

export const XLogo = ({ color, size = 15 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
    />
  </Svg>
);

export const GitHubLogo = ({ color, size = 16 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16">
    <Path
      fill={color}
      d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
    />
  </Svg>
);
