import { useCallback, useEffect, useRef, useState } from "react";

import { useAdaptiveAnc } from "@/hooks/use-adaptive-anc";
import { desktop } from "@/hooks/use-desktop";
import { useEarbuds } from "@/hooks/use-earbuds";
import { useGameMode } from "@/hooks/use-game-mode";
import { useMyEqs } from "@/hooks/use-my-eqs";
import { useStartWithWindows } from "@/hooks/use-start-with-windows";
import { type Correction, seconds } from "@/utils/corrections";
import { loadPref, savePref } from "@/utils/prefs";
import { QUIET_ECHO_MS, QUIET_PLAY_MS, QUIET_PROMPT_MS, readVolume, type TapWatch } from "@/utils/volume-taps";

/** "ANC", not "Noise cancelling": the user asked for the short name, and it fits a flyout tile on one line. */
export const MODE_NAMES = ["Off", "ANC", "Transparency"];
export const modeName = (m: number) => MODE_NAMES[m] ?? `Mode ${m}`;

const NOTIFY_KEY = "budpilot.notify";
const canNotify = () => !!desktop() && typeof Notification !== "undefined";

/** "Tell me when Shono steps in": a short Windows notification after each put-back, unless Shono is in front. */
function useStepInNotice(corrections: Correction[]) {
  const [on, setOnState] = useState(() => loadPref<boolean>(NOTIFY_KEY) !== false);
  const [since] = useState(() => Date.now()); // only put-backs from now on; the log keeps older ones
  const latest = corrections[0];

  useEffect(() => {
    if (!on || !latest || latest.at < since || !canNotify() || document.hasFocus()) return;
    const n = new Notification("Shono kept your noise setting", {
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

const VOLUME_TAPS_KEY = "budpilot.volumeTaps"; // earbud volume taps move Windows' volume (on unless turned off)
const log = (line: string) => desktop()?.log?.(line);

/** The earbuds' taps, made to work on Windows: volume taps change Windows' volume, with its pop-up (see
 * utils/volume-taps for how a tap is told apart from voice prompts and Windows' own echo), and the desktop app keeps a
 * play/pause tap from being undone (see desktop/main.js). Every press, and every would-be tap dropped, is logged. */
function useEarbudTaps({ state, status, watchVolume }: ReturnType<typeof useEarbuds>) {
  const [on, setOnState] = useState(() => loadPref<boolean>(VOLUME_TAPS_KEY) !== false);
  useEffect(() => watchVolume(on && !!desktop()?.volumeKeys), [on, watchVolume]); // the 0.5 s volume reads
  const volume = state?.volume;
  const anc = state?.anc;
  const playing = state?.playing;
  const connected = status === "connected";
  const watch = useRef<TapWatch>({});
  const quietUntil = useRef(0); // until then a change in the earbuds' volume isn't a tap
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ volume, connected, on });
  useEffect(() => {
    latest.current = { volume, connected, on };
  });
  const hush = useCallback((ms: number) => {
    quietUntil.current = Math.max(quietUntil.current, Date.now() + ms);
  }, []);

  useEffect(() => desktop()?.mediaTaps?.(connected), [connected]);
  // the quiet times: a voice prompt (a noise-mode change, connecting), sound starting or stopping, Windows' volume moving
  useEffect(() => hush(QUIET_PROMPT_MS), [anc, connected, hush]);
  useEffect(() => hush(QUIET_PLAY_MS), [playing, hush]);
  useEffect(() => desktop()?.onWindowsVolume?.(() => hush(QUIET_ECHO_MS)), [hush]);

  // looks at the earbuds' volume on every change, and again when a pending change has had time to hold
  useEffect(() => {
    const look = () => {
      const { volume: v, connected: up, on: bridge } = latest.current;
      clearTimeout(timer.current);
      const keys = desktop()?.volumeKeys;
      if (!up || v === undefined || !keys) return void (watch.current = {});
      const now = Date.now();
      const r = readVolume(watch.current, v, now, !bridge || now < quietUntil.current);
      watch.current = r.w;
      if (r.note) log(r.note);
      if (r.checkAt !== undefined) timer.current = setTimeout(look, Math.max(0, r.checkAt - now));
      if (!r.presses) return;
      hush(QUIET_ECHO_MS); // Windows hands its new volume back to the earbuds: that echo is no tap
      log(`volume tap: pressed Volume ${r.presses > 0 ? "Up" : "Down"} ×${Math.abs(r.presses)} (earbuds now at ${v})`);
      keys(r.presses);
    };
    look();
  }, [volume, connected, hush]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    savePref(VOLUME_TAPS_KEY, v);
  }, []);
  return { available: !!desktop()?.volumeKeys, on, setOn };
}

/** Everything both views (tray flyout and settings window) show and change. */
export function useBudPilot() {
  const earbuds = useEarbuds();
  const { status, state, run, setEq, noisePref } = earbuds;
  const myEqs = useMyEqs({ state, setEq });
  const game = useGameMode({ state, connected: status === "connected", run, setEq, myEqs: myEqs.list });
  const startup = useStartWithWindows();
  const autoLevel = useCallback((level: number) => void run((e) => e.setAnc(1, level))(), [run]);
  // Adaptive runs app-wide (any view, or hidden in the tray)
  const adaptive = useAdaptiveAnc(state, noisePref, autoLevel);
  const notice = useStepInNotice(earbuds.corrections);
  const volumeTaps = useEarbudTaps(earbuds);
  return { ...earbuds, game, startup, adaptive, notice, myEqs, volumeTaps };
}

export type BudPilot = ReturnType<typeof useBudPilot>;
