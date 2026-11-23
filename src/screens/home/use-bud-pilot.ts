import { useCallback, useEffect, useRef, useState } from "react";

import { useAdaptiveAnc } from "@/hooks/use-adaptive-anc";
import { desktop } from "@/hooks/use-desktop";
import { useEarbuds } from "@/hooks/use-earbuds";
import { useGameMode } from "@/hooks/use-game-mode";
import { useStartWithWindows } from "@/hooks/use-start-with-windows";
import { type Correction, seconds } from "@/utils/corrections";
import { loadPref, savePref } from "@/utils/prefs";
import { PROMPT_MS, SETTLE_MS, tapKeys } from "@/utils/volume-taps";

/** "ANC", not "Noise cancelling": the user asked for the short name, and it fits a flyout tile on one line. */
export const MODE_NAMES = ["Off", "ANC", "Transparency"];
export const modeName = (m: number) => MODE_NAMES[m] ?? `Mode ${m}`;

const NOTIFY_KEY = "budpilot.notify";
const canNotify = () => !!desktop() && typeof Notification !== "undefined";

/** "Tell me when BudPilot steps in": a short Windows notification after each put-back, unless BudPilot is in front. */
function useStepInNotice(corrections: Correction[]) {
  const [on, setOnState] = useState(() => loadPref<boolean>(NOTIFY_KEY) !== false);
  const [since] = useState(() => Date.now()); // only put-backs from now on; the log keeps older ones
  const latest = corrections[0];

  useEffect(() => {
    if (!on || !latest || latest.at < since || !canNotify() || document.hasFocus()) return;
    const n = new Notification("BudPilot kept your noise setting", {
      body: `Your earbuds switched to ${modeName(latest.from)} by themselves. ${modeName(latest.to)} is back, after ${seconds(latest.ms)}.`,
      silent: true,
    });
    n.onclick = () => desktop()?.window("flyout");
  }, [on, latest, since]);

  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    savePref(NOTIFY_KEY, v);
  }, []);
  return { available: canNotify(), on, setOn };
}

/** The earbuds' taps, made to work on Windows: volume taps change Windows' volume, with its pop-up (see
 * utils/volume-taps), and the desktop app keeps a play/pause tap from being undone (see desktop/main.js). */
function useEarbudTaps({ state, status }: ReturnType<typeof useEarbuds>) {
  const volume = state?.volume;
  const anc = state?.anc;
  const playing = state?.playing;
  const connected = status === "connected";
  const last = useRef<number>(undefined); // the earbuds' volume at the last reading of this connection
  const quietUntil = useRef(0); // until then a change in it isn't a tap
  const hush = useCallback((ms: number) => {
    quietUntil.current = Math.max(quietUntil.current, Date.now() + ms);
  }, []);

  useEffect(() => desktop()?.mediaTaps?.(connected), [connected]);
  // the quiet times: a voice prompt (a noise-mode change, connecting), sound starting, Windows' volume moving
  useEffect(() => hush(PROMPT_MS), [anc, connected, hush]);
  useEffect(() => hush(SETTLE_MS), [playing, hush]);
  useEffect(() => desktop()?.onWindowsVolume?.(() => hush(SETTLE_MS)), [hush]);

  useEffect(() => {
    if (!connected || volume === undefined) {
      last.current = undefined;
      return;
    }
    const before = last.current;
    last.current = volume;
    const keys = desktop()?.volumeKeys;
    if (before === undefined || !keys || Date.now() < quietUntil.current) return;
    const presses = tapKeys(before, volume);
    if (!presses) return;
    hush(SETTLE_MS); // Windows may hand its new volume back to the earbuds: that echo is no tap
    keys(presses);
  }, [volume, connected, hush]);
}

/** Everything both views (tray flyout and settings window) show and change. */
export function useBudPilot() {
  const earbuds = useEarbuds();
  const { status, state, run, noisePref } = earbuds;
  const game = useGameMode({ state, connected: status === "connected", run });
  const startup = useStartWithWindows();
  const autoLevel = useCallback((level: number) => void run((e) => e.setAnc(1, level))(), [run]);
  // Adaptive runs app-wide (any view, or hidden in the tray)
  const adaptive = useAdaptiveAnc(state, noisePref, autoLevel);
  const notice = useStepInNotice(earbuds.corrections);
  useEarbudTaps(earbuds);
  return { ...earbuds, game, startup, adaptive, notice };
}

export type BudPilot = ReturnType<typeof useBudPilot>;
