import { useCallback, useEffect, useRef, useState } from "react";

import { connectEarbuds, hasKnownEarbuds } from "@/ble/connect";
import { desktop } from "@/hooks/use-desktop";
import type { Transport } from "@/jieli/client";
import { Earbuds, type EarbudsState, noiseModeMask, storedAncLevel } from "@/jieli/earbuds";
import { addCorrection, type Correction } from "@/utils/corrections";
import { byPressAndHold, caseChanged } from "@/utils/noise-switch";
import { loadPref, savePref } from "@/utils/prefs";

type Status = "idle" | "connecting" | "connected" | "reconnecting";

/** The noise setting the user picked in BudPilot; BudPilot puts it back when the earbuds change it by themselves. */
export type NoisePref = { mode: number; ncLevel: number; adaptive: boolean };

const REFRESH_MS = 3000;
const VOLUME_MS = 500; // the volume alone, more often: a volume tap should show in Windows right away
const RECONNECT_MS = 1000; // the earbuds switch ANC on ~3 s after power-up, so be connected before that
const NOISE_KEY = "budpilot.noise";
const STUCK_MS = 30_000; // an attempt this old has hung (Bluetooth can stall); allow a new one
const REUSE_MS = 20_000; // after a drop, reconnect straight to the same earbuds this long; then scan for them afresh
const DEAD_AFTER = 4; // reads in a row without an answer: the link is dead even if Bluetooth still calls it up
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
const log = (line: string) => desktop()?.log?.(line);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const batteryText = (b: EarbudsState["battery"]) =>
  (["left", "right", "case"] as const).map((k) => `${k} ${b[k] ? `${b[k].percent}%${b[k].charging ? " charging" : ""}` : "gone"}`).join(", ");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const drifted = (s: EarbudsState, p?: NoisePref) =>
  !!p &&
  !!s.ancGains[p.mode] &&
  (s.anc !== p.mode || (p.mode === 1 && !p.adaptive && s.ancLevel !== undefined && Math.abs(s.ancLevel - p.ncLevel) > 0.02));

/** Every noise mode these earbuds have: the list press and hold cycles through (like Hoco's app). BudPilot used to
 * shrink it to the kept mode, which left press and hold nothing to switch to. */
const allModes = (e: Earbuds) => noiseModeMask([0, 1, 2].filter((m) => !!e.state.ancGains[m]));

const applyNoise = (e: Earbuds, p: NoisePref) => (p.mode === 1 ? e.setAnc(1, p.adaptive ? undefined : p.ncLevel) : e.setAnc(p.mode));

export function useEarbuds() {
  // the Windows app connects by itself from the start (its shell calls __budpilotAutoConnect), so it starts out waiting
  const [status, setStatus] = useState<Status>(() => (desktop() ? "reconnecting" : "idle"));
  const [state, setState] = useState<EarbudsState>();
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
  // after Disconnect, BudPilot stops connecting by itself until Connect or its next start: never saved, so it can't
  // get stuck off (the user wants it connected whenever the earbuds are)
  const paused = useRef(false);
  const droppedAt = useRef(0); // when the last link dropped
  const connectedAt = useRef(0);
  const lastFail = useRef(""); // the last failure logged, so a long wait logs it once
  const [pcLinked, setPcLinked] = useState<boolean>(); // Windows has the earbuds connected (for sound)
  useEffect(() => desktop()?.onPcLink?.(setPcLinked), []);
  const noteFail = useCallback((err: unknown) => {
    const m = message(err);
    if (m !== lastFail.current) log(`connect failed: ${(lastFail.current = m)}`);
  }, []);
  const connectingSince = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const poll = useRef<ReturnType<typeof setInterval>>(undefined);
  const restoring = useRef(false);
  const [putting, setPutting] = useState<{ from: number; to: number }>(); // a put-back on its way
  const lastRestore = useRef(0);
  const undone = useRef(0);
  const pausedUntil = useRef(0);
  const ownChangeUntil = useRef(0);
  const poweredAt = useRef(0); // when an earbud last powered up (BudPilot connected, or one left/entered the case)
  const lastBattery = useRef<EarbudsState["battery"]>(undefined);

  /** Runs commands one at a time, in order, so quick slider moves aren't lost and refreshes never interleave. */
  const enqueue = useCallback((fn: () => Promise<void>) => {
    const done = queue.current.then(fn);
    queue.current = done.catch(() => {});
    return done;
  }, []);

  /** Logs a put-back: what the earbuds switched to, what came back, and how long BudPilot took. */
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
        if (e.state.anc !== p.mode) throw new Error(`The earbuds didn't take ${MODE_NAMES[p.mode]} back yet. BudPilot keeps trying.`);
        record(from, p.mode, tookMs);
        setError(undefined);
        // the firmware may still be finishing its own switch (and syncing the other earbud): say it once more
        setTimeout(() => {
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
      const p = pref.current;
      const now = Date.now();
      if (lastBattery.current && caseChanged(lastBattery.current, s.battery)) {
        poweredAt.current = now;
        log(`earbuds: ${batteryText(s.battery)}`);
      }
      lastBattery.current = s.battery;
      // our own changes match the choice, so only the earbuds' own changes count as drift
      if (!keepRef.current || !e || !p || !drifted(s, p) || now < pausedUntil.current || now < ownChangeUntil.current || restoring.current) return s;
      if (byPressAndHold(s.anc, p.mode, now - poweredAt.current, s.ancLevel, storedAncLevel(s, s.anc))) {
        const next = { ...p, mode: s.anc };
        pref.current = next;
        setNoisePref(next);
        savePref(NOISE_KEY, next);
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
    [putBack],
  );

  /** Handshake, read everything, put the saved noise setting back, then keep in sync. */
  const startSession = useCallback(
    async (t: Transport, how = "found by a scan") => {
      t.onDisconnect(() => {
        if (link.current !== t) return; // our own disconnect, or a link that already failed
        const recent = buds.current?.recentPushes.slice(-4).map((p) => `${p.at} ${p.op.toString(16)}: ${p.data}`);
        link.current = undefined;
        clearInterval(poll.current);
        buds.current = undefined;
        droppedAt.current = Date.now();
        log(`link lost after ${secs(droppedAt.current - connectedAt.current)}; last from the earbuds: ${recent?.join(" | ") || "nothing"}`);
        if (!wanted.current) return setStatus("idle");
        setStatus("reconnecting");
        void (async () => {
          // the earbuds went in the case or out of range: straight back to the same ones first (quick after a trip to
          // the case); after REUSE_MS __budpilotAutoConnect scans afresh, in case they're back under another address
          while (wanted.current && !buds.current && Date.now() - droppedAt.current < REUSE_MS) {
            await sleep(RECONNECT_MS);
            if (!wanted.current || buds.current || connecting.current) continue;
            connecting.current = true;
            try {
              await session.current!(await connectEarbuds({ reuse: true }), "the same earbuds");
            } catch (err) {
              noteFail(err);
            } finally {
              connecting.current = false;
            }
          }
        })();
      });
      const p = pref.current;
      const held = p && keepRef.current ? p : undefined;
      const e = await Earbuds.open(t, (s) => setState(restoreIfDrifted(s))).catch(async (err) => {
        await t.close();
        throw err;
      });
      if (buds.current) return void (await e.close()); // a slower attempt finished after another one won
      buds.current = e;
      link.current = t;
      poweredAt.current = Date.now(); // found freshly on: the firmware may still be about to switch by itself
      lastBattery.current = e.state.battery;
      setState(e.state);
      setError(undefined);
      setStatus("connected");
      connectedAt.current = Date.now();
      lastFail.current = "";
      log(`connected (${how})${droppedAt.current ? `, ${secs(connectedAt.current - droppedAt.current)} after the last drop` : ""}: ${batteryText(e.state.battery)}`);
      if (__DEV__) (globalThis as { __earbuds?: Earbuds }).__earbuds = e; // inspect from DevTools
      if (held && drifted(e.state, held)) {
        const from = e.state.anc;
        const started = Date.now();
        await enqueue(() => putBack(e, held, from, started)).catch((err) => setError(message(err)));
      }
      void enqueue(() => e.setNoiseModes(allModes(e))).catch(() => {}); // press and hold may use every mode
      // keep up with changes made by the earbud buttons or other apps; skips a beat if one is still running
      let refreshing = false;
      let tick = 0;
      let misses = 0;
      clearInterval(poll.current);
      poll.current = setInterval(() => {
        if (refreshing || buds.current !== e) return;
        refreshing = true;
        const full = ++tick % (REFRESH_MS / VOLUME_MS) === 0;
        void enqueue(() => (full ? e.refresh() : e.refreshVolume()))
          .then(() => {
            misses = 0;
            if (!full) return;
            const shown = restoreIfDrifted(e.state); // also retries after a back-off, when nothing new arrived
            if (shown !== e.state) setState(shown);
          })
          .catch(() => {
            // Bluetooth can keep a link the earbuds stopped answering on: drop it, and the reconnect starts over
            if (++misses !== DEAD_AFTER || buds.current !== e) return;
            log("the earbuds stopped answering; closing the link to start over");
            void e.close();
          })
          .finally(() => (refreshing = false));
      }, VOLUME_MS);
    },
    [enqueue, restoreIfDrifted, putBack, noteFail],
  );
  useEffect(() => {
    session.current = startSession; // the reconnect loop calls the latest one
  }, [startSession]);

  /** `auto`: started by BudPilot itself; on failure it keeps waiting quietly instead of showing an error. */
  const connect = useCallback(
    async ({ auto = false } = {}) => {
      if (connecting.current) return;
      connecting.current = true;
      connectingSince.current = Date.now();
      setError(undefined);
      setStatus(auto ? "reconnecting" : "connecting");
      wanted.current = true;
      paused.current = false;
      try {
        await startSession(await connectEarbuds());
      } catch (e) {
        noteFail(e);
        if (auto) setStatus("reconnecting");
        else {
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
  // so BudPilot connects by itself whenever the earbuds are around.
  useEffect(() => {
    (globalThis as { __budpilotAutoConnect?: () => void }).__budpilotAutoConnect = () => {
      if (connecting.current && Date.now() - connectingSince.current > STUCK_MS) connecting.current = false; // a hung attempt
      if (paused.current || buds.current || connecting.current) return;
      if (!wanted.current || !hasKnownEarbuds() || Date.now() - droppedAt.current >= REUSE_MS) void connect({ auto: true });
    };
  }, [connect]);

  // A remount (a live-mode code edit, an error boundary) must not leave this copy's link open: the earbuds take one
  // link at a time, so the new copy could never connect and the screen would say "Not connected" for good.
  useEffect(
    () => () => {
      wanted.current = false; // this copy stops reconnecting; the new one connects by itself
      link.current = undefined; // so the drop below isn't taken for the earbuds leaving
      clearInterval(poll.current);
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
    clearInterval(poll.current);
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

  /** "Keep my noise setting": off lets the earbuds' firmware switch modes as it likes. */
  const setKeep = useCallback((on: boolean) => {
    keepRef.current = on;
    setKeepState(on);
    savePref(KEEP_KEY, on);
  }, []);

  return { status, state, error, busy: pending > 0, connect, disconnect, run, noisePref, setNoise, keep, setKeep, corrections, putting, pcLinked };
}
