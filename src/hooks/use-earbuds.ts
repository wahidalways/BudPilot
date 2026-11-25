import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { connectEarbuds, watchSoundHere } from "@/ble/connect";
import { HOCO_EQ35 } from "@/devices/hoco-eq35";
import { desktop } from "@/hooks/use-desktop";
import type { Transport } from "@/jieli/client";
import { Earbuds, type EarbudsState, noiseModeMask, storedAncLevel, withEq } from "@/jieli/earbuds";
import { addCorrection, type Correction } from "@/utils/corrections";
import { holdsWhenSoundLeaves, READ_MS, readEvery, retryWait } from "@/utils/connection";
import { atSwitchOn, byPressAndHold, cameOnAbove, caseChanged } from "@/utils/noise-switch";
import { later, sleep } from "@/utils/later";
import { loadPref, savePref } from "@/utils/prefs";

import { logLine } from "../../modules/shono-keeper";

type Status = "idle" | "connecting" | "connected" | "reconnecting";

/** The noise setting the user picked in Shono; Shono puts it back when the earbuds change it by themselves. */
export type NoisePref = { mode: number; ncLevel: number; adaptive: boolean };

/** ANC switched on, from Shono or by press and hold: always at Low (the user, 2026-11-23: "whenever I turn on ANC,
 * I want the strength as low, always"). The strength can still change while it's on; the next switch-on is Low again. */
export const ancOn = (): NoisePref => ({ mode: 1, ncLevel: HOCO_EQ35.ancLevels[0].level, adaptive: false });

const VOLUME_MS = 500; // the volume alone, more often, while volume taps are on: a tap should show in Windows right away
const RECONNECT_MS = 1000; // the earbuds switch ANC on ~3 s after power-up, so be connected before that
const NOISE_KEY = "budpilot.noise";
const STUCK_MS = 30_000; // an attempt this old has hung (Bluetooth can stall); allow a new one
const REUSE_MS = 20_000; // after a drop, reconnect straight to the same earbuds this long; then scan for them afresh
// the earbuds' sound has been elsewhere this long: let the other device have them. Also how long "Connected" stays
// after the case closes (their sound leaves the phone first): 4 s felt slow (the user, 2026-11-25)
const RELEASE_MS = 1000;
const DEAD_AFTER = 3; // reads in a row without an answer: the link is dead even if Bluetooth still calls it up
const UNDONE_MS = 5000; // the earbuds undoing a restore this fast means they won't allow it right now
const BACKOFF_MS = 4000; // then wait this long before trying again; their resets come in short bursts
const VERIFY_DELAY_MS = 150; // then ask the earbuds what they're in
const SETTLE_MS = 1500; // and say it once more, after their own switch has finished
const OWN_CHANGE_MS = 2000; // after the user picks a mode the earbuds report the old one for a moment: not drift
const MODE_NAMES = ["Off", "ANC", "Transparency"];
const KEEP_KEY = "budpilot.keep"; // "Keep my noise setting" (on unless the user turns it off)
const CORRECTIONS_KEY = "budpilot.corrections";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** A line in the Windows app's connection log (%APPDATA%\BudPilot\connection.log), to find out why links drop. */
// Windows: connection.log through the shell; Android: Shono's log on the phone (App settings › Troubleshooting)
const log = (line: string) => {
  desktop()?.log?.(line);
  logLine(line);
};
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const batteryText = (b: EarbudsState["battery"]) =>
  (["left", "right", "case"] as const).map((k) => `${k} ${b[k] ? `${b[k].percent}%${b[k].charging ? " charging" : ""}` : "gone"}`).join(", ");

/** The same, apart from the volume and whether sound plays. */
const sameButTaps = (a: EarbudsState, b: EarbudsState) => JSON.stringify({ ...a, volume: 0, playing: 0 }) === JSON.stringify({ ...b, volume: 0, playing: 0 });

const drifted = (s: EarbudsState, p?: NoisePref) =>
  !!p &&
  !!s.ancGains[p.mode] &&
  (s.anc !== p.mode || (p.mode === 1 && !p.adaptive && s.ancLevel !== undefined && Math.abs(s.ancLevel - p.ncLevel) > 0.02));

/** Every noise mode these earbuds have: the list press and hold cycles through (like Hoco's app). Shono used to
 * shrink it to the kept mode, which left press and hold nothing to switch to. */
const allModes = (e: Earbuds) => noiseModeMask([0, 1, 2].filter((m) => !!e.state.ancGains[m]));

const applyNoise = (e: Earbuds, p: NoisePref) => (p.mode === 1 ? e.setAnc(1, p.adaptive ? undefined : p.ncLevel) : e.setAnc(p.mode));

export function useEarbuds() {
  // the Windows app connects by itself from the start (its shell calls __budpilotAutoConnect), so it starts out waiting
  const [status, setStatus] = useState<Status>(() => (desktop() ? "reconnecting" : "idle"));
  const [state, setState] = useState<EarbudsState>();
  // The earbuds' news, for the screen. A phone shows neither their volume nor whether sound plays (only Windows turns
  // volume taps into key presses), so on a phone a change in just those doesn't re-render the page. The volume still
  // goes to the log (read every 3 s): it shows whether volume taps reached the earbuds.
  const lastVolume = useRef<number>(undefined);
  const showState = useCallback((s: EarbudsState) => {
    if (s.volume !== undefined && s.volume !== lastVolume.current) log(`earbuds' volume ${(lastVolume.current = s.volume)}`);
    setState((old) => (Platform.OS === "android" && old && sameButTaps(old, s) ? old : s));
  }, []);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(0);
  const [noisePref, setNoisePref] = useState<NoisePref | undefined>(() => loadPref<NoisePref>(NOISE_KEY));
  const pref = useRef(noisePref);
  const [keep, setKeepState] = useState(() => loadPref<boolean>(KEEP_KEY) !== false);
  const keepRef = useRef(keep);
  const [corrections, setCorrections] = useState<Correction[]>(() => loadPref<Correction[]>(CORRECTIONS_KEY) ?? []);
  const buds = useRef<Earbuds>(undefined);
  const link = useRef<Transport>(undefined); // the live link; a drop of an older one is ignored
  const session = useRef<(t: Transport, how?: string) => Promise<void>>(undefined);
  const wanted = useRef(false); // the user wants to stay connected (false after Disconnect)
  const connecting = useRef(false); // one connection attempt at a time
  const relinking = useRef(false); // the loop after a drop is trying the same earbuds
  const retry = useRef<() => void>(undefined); // cancels a quick retry that's waiting
  const fails = useRef(0); // automatic tries in a row that failed (Android backs off, see retryWait); their sound
  // arriving, or Shono coming to the front, tries at once
  const notBefore = useRef(0); // no automatic try before this
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && void (notBefore.current = 0));
    return () => sub.remove();
  }, []);
  // after Disconnect, Shono stops connecting by itself until Connect or its next start: never saved, so it can't
  // get stuck off (the user wants it connected whenever the earbuds are)
  const paused = useRef(false);
  const droppedAt = useRef(0); // when the last link dropped
  const connectedAt = useRef(0);
  const lastFail = useRef(""); // the last failure logged, so a long wait logs it once
  // the earbuds' sound is on this device (Windows: its shell watches the classic link; a phone: Android's audio
  // connections); undefined until that's known
  const [pcLinked, setPcLinked] = useState<boolean>();
  // a phone has asked Android once (its answer may still be "can't tell"): automatic connecting waits for that, or its
  // first try at launch spent ~16 s connecting and scanning for earbuds that were in the case
  const [soundChecked, setSoundChecked] = useState(Platform.OS !== "android");
  useEffect(() => desktop()?.onPcLink?.(setPcLinked), []);
  useEffect(
    () =>
      watchSoundHere((here) => {
        setPcLinked(here);
        setSoundChecked(true);
      }),
    [],
  );
  const soundHere = useRef(pcLinked);
  const noteFail = useCallback((err: unknown) => {
    const m = message(err);
    if (m !== lastFail.current) log(`connect failed: ${(lastFail.current = m)}`);
  }, []);
  const connectingSince = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const poll = useRef<() => void>(undefined); // cancels the next read
  const manual = useRef(false); // the link came from the user's own Connect: following the sound doesn't take it away
  // only volume taps need the volume between full refreshes; a read costs a Bluetooth round trip (~1% of a core)
  const volumeWatch = useRef(true);
  const watchVolume = useCallback((on: boolean) => void (volumeWatch.current = on), []);
  const restoring = useRef(false);
  const [putting, setPutting] = useState<{ from: number; to: number }>(); // a put-back on its way
  const lastRestore = useRef(0);
  const undone = useRef(0);
  const pausedUntil = useRef(0);
  const ownChangeUntil = useRef(0);
  const poweredAt = useRef(0); // when an earbud last powered up (Shono connected, or one left/entered the case)
  const lastBattery = useRef<EarbudsState["battery"]>(undefined);
  const lastAnc = useRef<number>(undefined); // the noise mode last reported: tells ANC switching on from a strength change

  /** Saves a new noise choice made for the user (ANC back to Low, a press and hold), without applying it. */
  const keepChoice = useCallback((next: NoisePref) => {
    pref.current = next;
    setNoisePref(next);
    savePref(NOISE_KEY, next);
  }, []);

  /** Runs commands one at a time, in order, so quick slider moves aren't lost and refreshes never interleave. */
  const enqueue = useCallback((fn: () => Promise<void>) => {
    const done = queue.current.then(fn);
    queue.current = done.catch(() => {});
    return done;
  }, []);

  /** Logs a put-back: what the earbuds switched to, what came back, and how long Shono took. */
  const record = useCallback((from: number, to: number, ms: number) => {
    setCorrections((list) => {
      const next = addCorrection(list, { at: Date.now(), from, to, ms });
      savePref(CORRECTIONS_KEY, next);
      return next;
    });
  }, []);

  /** Puts the saved setting back, then asks the earbuds what they're in: only their report counts as done (they
   * acknowledge a command even when their firmware switches straight back). Logged only when it really took. */
  const putBack = useCallback(
    async (e: Earbuds, p: NoisePref, from: number, startedAt: number) => {
      restoring.current = true;
      setPutting({ from, to: p.mode });
      try {
        await applyNoise(e, p);
        const tookMs = Date.now() - startedAt; // how fast the earbuds switched back; the check below doesn't count
        await sleep(VERIFY_DELAY_MS);
        await e.refresh();
        if (e.state.anc !== p.mode) throw new Error(`The earbuds didn't take ${MODE_NAMES[p.mode]} back yet. Shono keeps trying.`);
        record(from, p.mode, tookMs);
        setError(undefined);
        // the firmware may still be finishing its own switch (and syncing the other earbud): say it once more
        later(() => {
          if (buds.current === e && pref.current === p && keepRef.current) void enqueue(() => applyNoise(e, p)).catch(() => {});
        }, SETTLE_MS);
      } finally {
        restoring.current = false;
        setPutting(undefined);
      }
    },
    [record, enqueue],
  );

  /** When the earbuds' firmware changes noise control by itself, puts the saved setting straight back (not queued
   * behind refreshes); a switch by press and hold becomes the new choice. The screen shows what the earbuds report. */
  const restoreIfDrifted = useCallback(
    (s: EarbudsState): EarbudsState => {
      const e = buds.current;
      const now = Date.now();
      if (lastBattery.current && caseChanged(lastBattery.current, s.battery)) {
        poweredAt.current = now;
        // only on a live link: while one opens, its batteries aren't read yet and would log as "gone"
        if (e) log(`earbuds: ${batteryText(s.battery)}`);
      }
      lastBattery.current = s.battery;
      // ANC switching on starts at Low, whoever switches it (see atSwitchOn)
      const prevAnc = lastAnc.current;
      lastAnc.current = s.anc;
      const low = ancOn();
      let p = pref.current;
      if (p && atSwitchOn(p, prevAnc, s.anc, low) !== p) keepChoice((p = low));
      if (!keepRef.current) {
        // not kept: the earbuds' own switches stay, but ANC still comes on at Low
        if (e && cameOnAbove(prevAnc, s.anc, s.ancLevel, low.ncLevel)) void enqueue(() => e.setAnc(1, low.ncLevel)).catch(() => {});
        return s;
      }
      // our own changes match the choice, so only the earbuds' own changes count as drift
      if (!e || !p || !drifted(s, p) || now < pausedUntil.current || now < ownChangeUntil.current || restoring.current) return s;
      if (byPressAndHold(s.anc, p.mode, now - poweredAt.current, s.ancLevel, storedAncLevel(s, s.anc))) {
        keepChoice(s.anc === 1 ? low : { ...p, mode: s.anc }); // at another strength, the next check puts Low back
        return s;
      }
      undone.current = now - lastRestore.current < UNDONE_MS ? undone.current + 1 : 0;
      if (undone.current >= 2) {
        undone.current = 0;
        pausedUntil.current = now + BACKOFF_MS; // e.g. out of your ears; try again later
        return s;
      }
      lastRestore.current = now;
      void putBack(e, p, s.anc, now).catch((err) => setError(message(err)));
      return s;
    },
    [putBack, keepChoice, enqueue],
  );

  /** Handshake, read everything, put the saved noise setting back, then keep in sync. */
  const startSession = useCallback(
    async (t: Transport, how = "found by a scan") => {
      t.onDisconnect(() => {
        if (link.current !== t) return; // our own disconnect, or a link that already failed
        const recent = buds.current?.recentPushes.slice(-4).map((p) => `${p.at} ${p.op.toString(16)}: ${p.data}`);
        link.current = undefined;
        poll.current?.();
        buds.current = undefined;
        manual.current = false; // the user's Connect ends with its link: the relinks below follow the sound again
        droppedAt.current = Date.now();
        log(`link lost after ${secs(droppedAt.current - connectedAt.current)}; last from the earbuds: ${recent?.join(" | ") || "nothing"}`);
        if (!wanted.current) return setStatus("idle");
        setStatus("reconnecting");
        void (async () => {
          // the earbuds went in the case or out of range: straight back to the same ones first (quick after a trip to
          // the case); after REUSE_MS __budpilotAutoConnect scans afresh, in case they're back under another address
          relinking.current = true;
          try {
            while (wanted.current && !buds.current && soundHere.current !== false && Date.now() - droppedAt.current < REUSE_MS) {
              await sleep(RECONNECT_MS);
              if (!wanted.current || buds.current || connecting.current) continue;
              connecting.current = true;
              connectingSince.current = Date.now(); // or the stuck-attempt check takes it for hung and starts a second
              try {
                await session.current!(await connectEarbuds({ reuse: true }), "the same earbuds");
              } catch (err) {
                noteFail(err);
              } finally {
                connecting.current = false;
              }
            }
          } finally {
            relinking.current = false;
          }
        })();
      });
      const e = await Earbuds.open(t, (s) => showState(restoreIfDrifted(s))).catch(async (err) => {
        await t.close();
        throw err;
      });
      // a slower attempt finished after another one won, or the user disconnected meanwhile
      if (buds.current || !wanted.current) return void (await e.close());
      buds.current = e;
      link.current = t;
      poweredAt.current = Date.now(); // found freshly on: the firmware may still be about to switch by itself
      lastBattery.current = e.state.battery;
      setState(e.state);
      setError(undefined);
      setStatus("connected");
      connectedAt.current = Date.now();
      lastFail.current = "";
      fails.current = 0;
      log(`connected (${how})${droppedAt.current ? `, ${secs(connectedAt.current - droppedAt.current)} after the last drop` : ""}: ${batteryText(e.state.battery)}`);
      if (__DEV__) (globalThis as { __earbuds?: Earbuds }).__earbuds = e; // inspect from DevTools
      // a new link counts as ANC switching on: the earbuds were in the case or out of reach, so ANC starts at Low
      const low = ancOn();
      lastAnc.current = e.state.anc;
      const chosen = pref.current;
      const p = chosen && atSwitchOn(chosen, 0, e.state.anc, low);
      if (p && p !== chosen) keepChoice(p);
      if (keepRef.current && p && drifted(e.state, p)) {
        const from = e.state.anc;
        const started = Date.now();
        await enqueue(() => putBack(e, p, from, started)).catch((err) => setError(message(err)));
      } else if (!keepRef.current && cameOnAbove(0, e.state.anc, e.state.ancLevel, low.ncLevel)) {
        void enqueue(() => e.setAnc(1, low.ncLevel)).catch(() => {});
      }
      void enqueue(() => e.setNoiseModes(allModes(e))).catch(() => {}); // press and hold may use every mode
      // keep up with changes made by the earbud buttons or other apps; skips a beat if one is still running. A full read
      // every 3 s on screen (30 s in the background on Android); the volume alone every 0.5 s only while volume taps
      // need it (Windows); and right after a put-back's back-off ends, so its retry isn't kept waiting
      let refreshing = false;
      let lastFull = Date.now();
      let misses = 0;
      poll.current?.();
      const tick = () => {
        if (buds.current !== e) return;
        const background = Platform.OS === "android" && AppState.currentState !== "active";
        const fullEvery = readEvery(background, misses);
        const step = volumeWatch.current ? VOLUME_MS : fullEvery;
        const wake = pausedUntil.current - Date.now();
        poll.current = later(tick, wake > 0 ? Math.min(step, wake + 50) : step);
        if (refreshing) return;
        const full = !volumeWatch.current || Date.now() - lastFull >= fullEvery - 50;
        if (full) lastFull = Date.now();
        refreshing = true;
        void enqueue(() => (full ? e.refresh() : e.refreshVolume()))
          .then(() => {
            misses = 0;
            if (!full) return;
            const shown = restoreIfDrifted(e.state); // also retries after a back-off, when nothing new arrived
            if (shown !== e.state) showState(shown);
          })
          .catch(() => {
            // Bluetooth can keep a link the earbuds stopped answering on: drop it, and the reconnect starts over
            if (++misses !== DEAD_AFTER || buds.current !== e) return;
            log("the earbuds stopped answering; closing the link to start over");
            void e.close();
          })
          .finally(() => (refreshing = false));
      };
      poll.current = later(tick, volumeWatch.current ? VOLUME_MS : READ_MS);
    },
    [enqueue, restoreIfDrifted, putBack, noteFail, keepChoice, showState],
  );
  useEffect(() => {
    session.current = startSession; // the reconnect loop calls the latest one
  }, [startSession]);

  /** `auto`: started by Shono itself; on failure it keeps waiting quietly instead of showing an error. */
  const connect = useCallback(
    async ({ auto = false } = {}) => {
      if (connecting.current) return;
      connecting.current = true;
      connectingSince.current = Date.now();
      setError(undefined);
      setStatus(auto ? "reconnecting" : "connecting");
      wanted.current = true;
      paused.current = false;
      manual.current = holdsWhenSoundLeaves(auto, soundHere.current);
      try {
        // only the user's own Connect asks for Bluetooth access: an automatic try popped Android's question up by itself
        await startSession(await connectEarbuds({ ask: !auto }));
      } catch (e) {
        noteFail(e);
        if (auto) {
          if (wanted.current) setStatus("reconnecting"); // a Disconnect meanwhile stays a Disconnect
          if (Platform.OS === "android") {
            const wait = retryWait(fails.current++);
            notBefore.current = Date.now() + wait;
            // the earbuds play on this phone, so they're on and near: try again (the earbuds' Bluetooth LE side can take
            // a few seconds longer than their sound after leaving the case). Not on Windows: a scan there needs the
            // user gesture the shell's own tick carries
            if (wanted.current && soundHere.current === true) {
              retry.current?.();
              retry.current = later(() => (globalThis as { __budpilotAutoConnect?: () => void }).__budpilotAutoConnect?.(), wait);
            }
          }
        } else {
          wanted.current = false;
          setError(message(e));
          setStatus("idle");
        }
      } finally {
        connecting.current = false;
      }
    },
    [startSession, noteFail],
  );

  // The Windows shell calls this on start and every few seconds (with the user gesture Bluetooth scanning needs),
  // so Shono connects by itself whenever the earbuds are around.
  useEffect(() => {
    (globalThis as { __budpilotAutoConnect?: () => void }).__budpilotAutoConnect = () => {
      if (connecting.current && Date.now() - connectingSince.current > STUCK_MS) connecting.current = false; // a hung attempt
      if (paused.current || buds.current || connecting.current || soundHere.current === false || Date.now() < notBefore.current) return;
      // in the background on Android, only when the earbuds play on this phone: no endless scans while that's unknown
      if (Platform.OS === "android" && AppState.currentState !== "active" && soundHere.current !== true) return;
      // right after a drop the loop above tries the same earbuds; once it has stopped (their sound left, then came
      // back), a fresh attempt mustn't wait out the rest of REUSE_MS
      if (!relinking.current) void connect({ auto: true });
    };
  }, [connect]);

  // Follow the sound. The earbuds take one control link at a time, so it goes to the device they're playing on: when
  // their sound moves to another device, let go (after a few seconds, so a blip doesn't); when it comes back, connect
  // at once instead of waiting for the next try.
  // (also once a connection finishes after the sound has left; not one the user made with Connect)
  useEffect(() => {
    soundHere.current = pcLinked;
    if (pcLinked === true) {
      fails.current = 0; // their sound just arrived: they're on and near, so try now and quickly again
      notBefore.current = 0;
      if (wanted.current && !paused.current && !buds.current && !connecting.current) void connect({ auto: true });
      return;
    }
    if (pcLinked !== false || status !== "connected" || manual.current) return;
    return later(() => {
      const e = buds.current;
      if (soundHere.current !== false || !e || manual.current) return;
      log("the earbuds' sound moved to another device: letting go of them so it can connect");
      poll.current?.();
      buds.current = undefined;
      link.current = undefined; // so the drop isn't taken for the earbuds leaving
      droppedAt.current = Date.now();
      setStatus("reconnecting"); // still wanted: connects again when the sound comes back
      void e.close();
    }, RELEASE_MS);
  }, [pcLinked, status, connect]);

  // A remount (a live-mode code edit, an error boundary) must not leave this copy's link open: the earbuds take one
  // link at a time, so the new copy could never connect and the screen would say "Not connected" for good.
  useEffect(
    () => () => {
      wanted.current = false; // this copy stops reconnecting; the new one connects by itself
      link.current = undefined; // so the drop below isn't taken for the earbuds leaving
      poll.current?.();
      void buds.current?.close();
      buds.current = undefined;
    },
    [],
  );

  const disconnect = useCallback(async () => {
    wanted.current = false;
    paused.current = true;
    log("disconnected by the user: no connecting by itself until Connect or a restart");
    const e = buds.current;
    poll.current?.();
    buds.current = undefined;
    link.current = undefined;
    setStatus("idle");
    await e?.close();
  }, []);

  /** Queues a user command; errors show on screen. */
  const run = useCallback(
    (fn: (e: Earbuds) => Promise<void>) => (): Promise<void> => {
      const e = buds.current;
      if (!e) return Promise.resolve();
      setPending((n) => n + 1);
      setError(undefined);
      return enqueue(() => fn(e))
        .catch((err) => setError(message(err)))
        .finally(() => setPending((n) => n - 1));
    },
    [enqueue],
  );

  /** Saves the user's noise choice and applies it. */
  const setNoise = useCallback(
    (p: NoisePref) => {
      pref.current = p;
      ownChangeUntil.current = Date.now() + OWN_CHANGE_MS; // the user's own change, not one to undo
      setNoisePref(p);
      savePref(NOISE_KEY, p);
      return run((e) => applyNoise(e, p))();
    },
    [run],
  );

  // EQ changes on their way to the earbuds. The screen shows them at once: until the earbuds have one, a refresh
  // reports the old curve, which made a dragged curve jump back and the pills flash "Custom" (user, 2026-11-23).
  const [eqSending, setEqSending] = useState<{ mode: number; gains: number[] }[]>([]);
  /** Plays EQ mode `mode` with `gains` (for Custom, also stores them); shown straight away, in the order sent. */
  const setEq = useCallback(
    (mode: number, gains: number[]) => {
      const w = { mode, gains };
      setEqSending((l) => [...l, w]);
      return run((e) => e.setEq(mode, gains))().finally(() => setEqSending((l) => l.filter((x) => x !== w)));
    },
    [run],
  );
  const shown = useMemo(() => state && eqSending.reduce((s, w) => withEq(s, w.mode, w.gains), state), [state, eqSending]);

  /** "Keep my noise setting": off lets the earbuds' firmware switch modes as it likes. */
  const setKeep = useCallback((on: boolean) => {
    keepRef.current = on;
    setKeepState(on);
    savePref(KEEP_KEY, on);
  }, []);

  // one object while nothing in it changes: React's compiler can't take this hook (its try/finally), and a new object on
  // every render re-rendered the whole page on screen for anything at all, a sheet opening, a toast (the user, 2026-11-25)
  const busy = pending > 0;
  return useMemo(
    () => ({ status, state: shown, error, busy, connect, disconnect, run, setEq, watchVolume, noisePref, setNoise, keep, setKeep, corrections, putting, pcLinked, soundChecked }),
    [status, shown, error, busy, connect, disconnect, run, setEq, watchVolume, noisePref, setNoise, keep, setKeep, corrections, putting, pcLinked, soundChecked],
  );
}
