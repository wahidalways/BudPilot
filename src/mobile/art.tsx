// Icons the phone screens add to ui/icons, and the device photos.
import Svg, { Circle, Path } from "react-native-svg";

type P = { color: string; size?: number };
const line = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const CheckIcon = ({ color, size = 14 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 12.5l4.2 4.2L19 7" stroke={color} strokeWidth={2.8} {...line} />
  </Svg>
);
export const ChevronRight = ({ color, size = 16 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} {...line} />
  </Svg>
);
export const InfoIcon = ({ color, size = 16 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.7} fill="none" />
    <Path d="M12 11v5M12 8h.01" stroke={color} strokeWidth={1.9} {...line} />
  </Svg>
);

const stroke = (d: string, color: string, size: number, w = 1.8) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={d} stroke={color} strokeWidth={w} {...line} />
  </Svg>
);
export const SunIcon = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} fill="none" />
    <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke={color} strokeWidth={1.8} {...line} />
  </Svg>
);
export const MoonIcon = ({ color, size = 22 }: P) => stroke("M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z", color, size);
export const BluetoothIcon = ({ color, size = 30 }: P) => stroke("m7 7 10 10-5 5V2l5 5L7 17", color, size);
export const PinIcon = ({ color, size = 30 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" stroke={color} strokeWidth={1.8} {...line} />
    <Circle cx={12} cy={9} r={2.5} stroke={color} strokeWidth={1.8} fill="none" />
  </Svg>
);
export const BackIcon = ({ color, size = 24 }: P) => stroke("M15 6l-6 6 6 6", color, size, 2);

/** A tap gesture as dots, one per tap. */
export const Dots = ({ n, color }: { n: number; color: string }) => (
  <Svg width={8} height={24} viewBox="0 0 8 24">
    {Array.from({ length: n }, (_, i) => (
      <Circle key={i} cx={4} cy={12 + (i - (n - 1) / 2) * 7} r={2.4} fill={color} />
    ))}
  </Svg>
);

// The device photos and the makers' logos (public/device-photos). shortcut: one model, add a table when there are more.
export const PHOTOS = {
  left: require("../../public/device-photos/eq35/hd/left.webp"),
  right: require("../../public/device-photos/eq35/hd/right.webp"),
  case: require("../../public/device-photos/eq35/hd/case.webp"),
  /** the case without the maker's logo, for the screens before a device is found */
  casePlain: require("../../public/device-photos/eq35/hd/case-plain.webp"),
};
const LOGOS: Record<string, { src: number; aspect: number }> = {
  HOCO: { src: require("../../public/device-photos/hoco-logo.png"), aspect: 237 / 75 },
};

/** The connected earbuds' maker (its logo) and model, from the name they report ("HOCO EQ35 ANC"). */
export function brandOf(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const logo = LOGOS[first?.toUpperCase() ?? ""];
  return logo ? { logo, model: rest.join(" ") } : { logo: undefined, model: name };
}
