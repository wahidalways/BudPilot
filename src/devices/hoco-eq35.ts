/** What Hoco's own app (hoco.music) shows and sends for the HOCO EQ35 ANC, so Shono matches it. */
export const HOCO_EQ35 = {
  eqBands: ["30", "60", "120", "250", "500", "1K", "2K", "4K", "8K", "16K"],
  /** Custom slider range in Hoco's app (VerticalSeekBarView: -5..5), in dB either side of 0. */
  eqMax: 5,
  /** Product photos for the device card, served from public/device-photos when this computer has them (Hoco's
   * artwork); the card shows no photos when they're missing. `aspect`: width / height. */
  photos: {
    left: { uri: "/device-photos/eq35/left.png", aspect: 420 / 600 },
    right: { uri: "/device-photos/eq35/right.png", aspect: 420 / 600 },
    case: { uri: "/device-photos/eq35/case.png", aspect: 1 },
  },
  /** The EQ mode Hoco's "Custom Equalizer" uses. */
  customEqMode: 9,
  /** Hoco's named presets: the exact mode and gains its app sends. The earbuds play their own stored curve for
   * these modes and ignore the gains (checked on the earbuds), so only the mode really matters. Those gains don't
   * match the names (Normal's lifts the bass 8 dB), so the curve Shono shows is `shape`: what each preset does, by
   * its name (the user, 2026-11-24: Normal is flat, Bass Boost raises the bass, Bass Reduction lowers it). Within
   * ±5 dB. */
  eqPresets: [
    { name: "Normal", mode: 0, gains: [0, 8, 8, 4, 0, 0, 0, 0, 2, 2], shape: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { name: "Bass Boost", mode: 1, gains: [3, 1, 0, -2, -4, -4, -2, 0, 1, 2], shape: [5, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
    { name: "Bass Reduction", mode: 2, gains: [-2, 0, 2, 4, -2, -2, 0, 0, 4, 4], shape: [-5, -5, -4, -2, 0, 0, 0, 0, 0, 0] },
    { name: "Classic", mode: 3, gains: [0, 0, 0, 4, 4, 4, 0, 2, 3, 4], shape: [3, 2, 1, 0, 0, 0, 0, 1, 2, 3] },
  ] as { name: string; mode: number; gains?: number[]; shape: number[] }[],
  /** Noise-cancelling strengths, as a share of the earbuds' maximum: the lowest, middle and highest of the five
   * steps Hoco's app uses (cur = (n + 0.5) / 5 of max; its ANC button uses the highest). Checked on the earbuds. */
  ancLevels: [
    { name: "Low", level: 0.1 },
    { name: "Mid", level: 0.5 },
    { name: "High", level: 0.9 },
  ],
  /** Touch functions in Hoco's app, in its order, with the earbuds' code for each. */
  keyFunctions: [
    { name: "Play/Pause", fn: 5 },
    { name: "Volume Up", fn: 9 },
    { name: "Volume Down", fn: 10 },
    { name: "Previous Track", fn: 3 },
    { name: "Next Track", fn: 4 },
    { name: "Voice Assistant", fn: 2 },
    { name: "None", fn: 0 },
  ],
};
