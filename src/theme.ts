import { useColorScheme } from "react-native";

const light = {
  bg: "#F4F5F7",
  card: "#FFFFFF",
  sunken: "#E9ECEF",
  text: "#14171A",
  muted: "#5E6670",
  border: "#DDE1E6",
  accent: "#2563EB",
  accentSoft: "#E6EEFD",
  onAccent: "#FFFFFF",
  danger: "#B42318",
};

const dark: typeof light = {
  bg: "#0F1114",
  card: "#181B20",
  sunken: "#0B0D10",
  text: "#ECEFF3",
  muted: "#99A2AD",
  border: "#2A2F37",
  accent: "#6B9BFF",
  accentSoft: "#1C2740",
  onAccent: "#0B1020",
  danger: "#FF7A6E",
};

export type Colors = typeof light;

export const useColors = (): Colors => (useColorScheme() === "dark" ? dark : light);
