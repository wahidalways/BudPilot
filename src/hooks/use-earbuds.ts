import { useCallback, useEffect, useRef, useState } from "react";

import { connectEarbuds, hasKnownEarbuds } from "@/ble/connect";
import type { Transport } from "@/jieli/client";
import { Earbuds, type EarbudsState, noiseModeMask } from "@/jieli/earbuds";
import { loadPref, savePref } from "@/utils/prefs";

type Status = "idle" | "connecting" | "connected" | "reconnecting";

/** The noise setting the user picked in BudPilot; BudPilot puts it back when the earbuds change it by themselves. */
export type NoisePref = { mode: number; ncLevel: number; adaptive: boolean };

const REFRESH_MS = 3000;
const RECONNECT_MS = 1000; // the earbuds switch ANC on ~3 s after power-up, so be connected before that
const NOISE_KEY = "budpilot.noise";
const STUCK_MS = 30_000; // an attempt this old has hung (Bluetooth can stall); allow a new one
const AUTO_KEY = "budpilot.autoConnect"; // connect by itself (off after the user presses Disconnect)
const UNDONE_MS = 5000; // the earbuds undoing a restore this fast means they won't allow it right now
const BACKOFF_MS = 4000; // then wait this long before trying again; their resets come in short bursts

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const drifted = (s: EarbudsState, p?: NoisePref) =>
  !!p &&
  !!s.ancGains[p.mode] &&
  (s.anc !== p.mode || (p.mode === 1 && !p.adaptive && s.ancLevel !== undefined && Math.abs(s.ancLevel - p.ncLevel) > 0.02));

/** The only noise mode the earbuds may switch to by themselves: the chosen one. Their firmware switches modes on its
 * own after powering up (ANC, or the next allowed mode), so with a one-mode list it has nowhere else to go. */
const allowedModes = (p: NoisePref) => noiseModeMask([p.mode]);

/** `restore`: putting the choice back, so the mode goes first (quickest); a new choice sets the list first. */
const applyNoise = async (e: Earbuds, p: NoisePref, restore = false) => {
  const setMode = () => (p.mode === 1 ? e.setAnc(1, p.adaptive ? undefined : p.ncLevel) : e.setAnc(p.mode));
  const setList = () => e.setNoiseModes(allowedModes(p)).catch(() => {});
  if (restore) {
    await setMode();
    void setList(); // don't hold up the next restore if the earbuds are slow to answer (they are, just after power-up)
  } else {
    await setList();
    await setMode();
  }
};

export function useEarbuds() {
  const [status, setStatus] = useState<Status>("idle");
  const [state, setState] = useState<EarbudsState>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(0);
  const [noisePref, setNoisePref] = useState<NoisePref | undefined>(() => loadPref<NoisePref>(NOISE_KEY));
  const pref = useRef(noisePref);
  const buds = useRef<Earbuds>(undefined);
  const link = useRef<Transport>(undefined); // the live link; a drop of an older one is ignored
  const session = useRef<(t: Transport) => Promise<void>>(undefined);
  const wanted = useRef(false); // the user wants to stay connected (false after Disconnect)
  const connecting = useRef(false); // one connection attempt at a time
  const connectingSince = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const poll = useRef<ReturnType<typeof setInterval>>(undefined);
  const restoring = useRef(false);
  const lastRestore = useRef(0);
  const undone = useRef(0);
  const pausedUntil = useRef(0);

  /** Runs commands one at a time, in order, so quick slider moves aren't lost and refreshes never interleave. */
  const enqueue = useCallback((fn: () => Promise<void>) => {
    const done = queue.current.then(fn);
    queue.current = done.catch(() => {});
    return done;
  }, []);

  /** When the earbuds change noise control by themselves, puts the saved setting straight back (not queued behind
   * refreshes) and returns the state to show: the saved setting, so the screen doesn't flicker. */
  const restoreIfDrifted = useCallback((s: EarbudsState): EarbudsState => {
    const e = buds.current;
    const p = pref.current;
    const now = Date.now();
    // our own changes match the choice, so only the earbuds' own changes count as drift
    if (!e || !p || !drifted(s, p) || now < pausedUntil.current) return s;
    if (!restoring.current) {
      undone.current = now - lastRestore.current < UNDONE_MS ? undone.current + 1 : 0;
      if (undone.current >= 2) {
        undone.current = 0;
        pausedUntil.current = now + BACKOFF_MS; // e.g. out of your ears; try again later
        return s;
      }
      restoring.current = true;
      lastRestore.current = now;
      void applyNoise(e, p, true)
        .catch((err) => setError(message(err)))
        .finally(() => (restoring.current = false));
    }
    return { ...s, anc: p.mode, ancLevel: p.mode === 1 && !p.adaptive ? p.ncLevel : s.ancLevel };
  }, []);

  /** Handshake, read everything, put the saved noise setting back, then keep in sync. */
  const startSession = useCallback(
    async (t: Transport) => {
      t.onDisconnect(() => {
        if (link.current !== t) return; // our own disconnect, or a link that already failed
        link.current = undefined;
        clearInterval(poll.current);
        buds.current = undefined;
        if (!wanted.current) return setStatus("idle");
        setStatus("reconnecting");
        void (async () => {
          // the earbuds went in the case or out of range: keep trying until they're back or the user stops
          while (wanted.current && !buds.current) {
            await sleep(RECONNECT_MS);
            if (!wanted.current || buds.current || connecting.current) continue;
            connecting.current = true;
            try {
              await session.current!(await connectEarbuds({ reuse: true }));
            } catch {
            } finally {
              connecting.current = false;
            }
          }
        })();
      });
      const p = pref.current;
      const e = await Earbuds.open(t, (s) => setState(restoreIfDrifted(s)), p && allowedModes(p)).catch(async (err) => {
        await t.close();
        throw err;
      });
      if (buds.current) return void (await e.close()); // a slower attempt finished after another one won
      buds.current = e;
      link.current = t;
      setState(e.state);
      setError(undefined);
      setStatus("connected");
      if (__DEV__) (globalThis as { __earbuds?: Earbuds }).__earbuds = e; // inspect from DevTools
      if (p && drifted(e.state, p)) {
        await enqueue(() => applyNoise(e, p, true)).catch((err) => setError(message(err)));
      }
      // keep up with changes made by the earbud buttons or other apps; skips a beat if one is still running
      let refreshing = false;
      clearInterval(poll.current);
      poll.current = setInterval(() => {
        if (refreshing || buds.current !== e) return;
        refreshing = true;
        void enqueue(() => e.refresh())
          .then(() => {
            const shown = restoreIfDrifted(e.state); // also retries after a back-off, when nothing new arrived
            if (shown !== e.state) setState(shown);
          })
          .catch(() => {})
          .finally(() => (refreshing = false));
      }, REFRESH_MS);
    },
    [enqueue, restoreIfDrifted],
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
      try {
        await startSession(await connectEarbuds());
        savePref(AUTO_KEY, true);
      } catch (e) {
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
    [startSession],
  );

  // The Windows shell calls this on start and every few seconds (with the user gesture Bluetooth scanning needs),
  // so BudPilot connects by itself whenever the earbuds are around.
  useEffect(() => {
    (globalThis as { __budpilotAutoConnect?: () => void }).__budpilotAutoConnect = () => {
      if (connecting.current && Date.now() - connectingSince.current > STUCK_MS) connecting.current = false; // a hung attempt
      if (loadPref<boolean>(AUTO_KEY) === false || buds.current || connecting.current) return;
      if (!wanted.current || !hasKnownEarbuds()) void connect({ auto: true });
    };
  }, [connect]);

  const disconnect = useCallback(async () => {
    wanted.current = false;
    savePref(AUTO_KEY, false);
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
      setNoisePref(p);
      savePref(NOISE_KEY, p);
      return run((e) => applyNoise(e, p))();
    },
    [run],
  );

  return { status, state, error, busy: pending > 0, connect, disconnect, run, noisePref, setNoise };
}
