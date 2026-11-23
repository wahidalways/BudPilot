// Frosted glass, painted inside an opaque window. A see-through window would show the real desktop, but Chromium
// then drops ClearType and every word looks soft; so the page paints the desktop wallpaper itself, blurred once and
// lined up with the real one behind the window, under the theme's tint and a fine grain (what Windows' Mica does).
// It's all one background on <body>: no extra layers, so text keeps its sharp rendering.
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { desktop, type Place, useView } from "@/hooks/use-desktop";
import { useColors } from "@/theme";

const WEB = Platform.OS === "web" && typeof document !== "undefined";
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'>" +
  "<feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0.07 0 0 0 0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

type Blurred = { url: string; w: number; h: number };

/** The wallpaper copy, blurred as strongly as the mock's glass (40 px on a 1920 screen) and a little richer. */
async function blur(src: string): Promise<Blurred> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const r = Math.max(4, Math.round(img.width / 48));
  ctx.filter = `blur(${r}px) saturate(1.25)`;
  ctx.drawImage(img, -2 * r, -2 * r, img.width + 4 * r, img.height + 4 * r); // overdrawn, so the edges don't fade out
  return { url: canvas.toDataURL("image/jpeg", 0.9), w: img.width, h: img.height };
}

/** Paints the backdrop on <body>. Without the Windows app, or without a picture wallpaper, it's a soft backdrop in
 * the accent's colors under the same tint. */
export function Frost() {
  const c = useColors();
  const view = useView();
  const [place, setPlace] = useState<Place>();
  const [wall, setWall] = useState<Blurred & { stamp: string }>();

  useEffect(() => {
    const d = desktop();
    if (!WEB || !d?.frost || !d.onFrost) return;
    let live = true;
    let loading = "";
    const load = async () => {
      const f = await d.frost!();
      if (!live) return;
      setPlace(f);
      loading = f.stamp;
      const next = f.wallpaper ? await blur(f.wallpaper).catch(() => undefined) : undefined;
      if (live && loading === f.stamp) setWall(next && { ...next, stamp: f.stamp });
    };
    void load();
    const off = d.onFrost((p) => {
      setPlace(p);
      if (p.stamp !== loading) void load(); // another wallpaper
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  useEffect(() => {
    if (!WEB) return;
    const tint = view === "flyout" ? c.acrylic : c.mica;
    const layers = [
      { image: GRAIN, size: "180px 180px", position: "0 0", repeat: "repeat" },
      { image: `linear-gradient(${tint}, ${tint})`, size: "auto", position: "0 0", repeat: "no-repeat" },
    ];
    if (wall && place) {
      // the wallpaper fills its screen (Windows' "Fill"): the same size and offset here puts it right behind the window
      const k = Math.max(place.screenW / wall.w, place.screenH / wall.h);
      const [w, h] = [wall.w * k, wall.h * k];
      layers.push({ image: `url(${wall.url})`, size: `${w}px ${h}px`, position: `${(place.screenW - w) / 2 - place.x}px ${(place.screenH - h) / 2 - place.y}px`, repeat: "no-repeat" });
    } else {
      layers.push({ image: `radial-gradient(120% 90% at 85% 10%, ${c.wallA}, transparent 60%)`, size: "auto", position: "0 0", repeat: "no-repeat" });
      layers.push({ image: `radial-gradient(90% 80% at 10% 90%, ${c.wallB}, transparent 55%)`, size: "auto", position: "0 0", repeat: "no-repeat" });
    }
    const s = document.body.style;
    s.backgroundColor = wall && place ? c.window : c.wallBase; // opaque underneath, always
    s.backgroundImage = layers.map((l) => l.image).join(", ");
    s.backgroundSize = layers.map((l) => l.size).join(", ");
    s.backgroundPosition = layers.map((l) => l.position).join(", ");
    s.backgroundRepeat = layers.map((l) => l.repeat).join(", ");
  }, [c, view, place, wall]);

  return null;
}

/** The glass's lit edge, over a whole view: bright along the top, faint around. */
export function Rim() {
  const c = useColors();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.rim, { boxShadow: `inset 0 1px 0 ${c.rimHi}, inset 0 0 0 1px ${c.rimLo}` }]} />;
}

const s = StyleSheet.create({
  rim: { borderRadius: 8 }, // Windows 11 rounds the window's corners by this much
});
