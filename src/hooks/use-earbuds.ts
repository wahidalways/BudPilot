import { useCallback, useRef, useState } from "react";

import { connectEarbuds } from "@/ble/connect";
import { Earbuds, type EarbudsState } from "@/jieli/earbuds";

type Status = "idle" | "connecting" | "connected";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useEarbuds() {
  const [status, setStatus] = useState<Status>("idle");
  const [state, setState] = useState<EarbudsState>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const buds = useRef<Earbuds>(undefined);

  const connect = useCallback(async () => {
    setError(undefined);
    setStatus("connecting");
    try {
      const t = await connectEarbuds();
      t.onDisconnect(() => {
        if (!buds.current) return; // our own disconnect, or a failed connect that reports its own error
        buds.current = undefined;
        setStatus("idle");
        setError("The earbuds disconnected.");
      });
      const e = await Earbuds.open(t, setState).catch(async (err) => {
        await t.close();
        throw err;
      });
      buds.current = e;
      setState(e.state);
      setStatus("connected");
    } catch (e) {
      setError(message(e));
      setStatus("idle");
    }
  }, []);

  const disconnect = useCallback(async () => {
    const e = buds.current;
    buds.current = undefined;
    setStatus("idle");
    await e?.close();
  }, []);

  /** Runs one command at a time; taps while one is in flight are ignored. */
  const run = useCallback(
    (fn: (e: Earbuds) => Promise<void>) => async () => {
      const e = buds.current;
      if (!e || busy) return;
      setBusy(true);
      setError(undefined);
      try {
        await fn(e);
      } catch (err) {
        setError(message(err));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  return { status, state, error, busy, connect, disconnect, run };
}
