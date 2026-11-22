import { useEffect, useState } from "react";

// Never the earbuds' own mic (opening it switches them to low-quality call audio), and never a loopback input,
// which would measure the music instead of the room.
const SKIP = /hands-?free|headset|hoco|eq35|bluetooth|stereo mix|what u hear|loopback|virtual|cable/i;
const SAMPLE_MS = 500;
const WINDOW = 20; // samples averaged: 10 s
const MIN_SAMPLES = 6; // 3 s of real sound before the first reading

export type RoomLoudness = { db?: number; mic?: string; error?: string };

/** Average room loudness (dBFS) from a computer microphone while `on`. Only the level is kept; nothing is recorded. */
export function useRoomLoudness(on: boolean): RoomLoudness {
  const [out, setOut] = useState<RoomLoudness>({});

  useEffect(() => {
    if (!on) return;
    let stopped = false;
    let cleanup = () => {};
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications");
        if (mics.length && mics.every((d) => !d.label)) throw new Error("Allow microphone access for BudPilot to use Adaptive.");
        const mic = mics.find((d) => !SKIP.test(d.label));
        if (!mic) throw new Error("Adaptive needs a microphone on this computer; the earbuds' own mic would lower the music quality.");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: mic.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream).connect(analyser); // not connected to the speakers
        const buf = new Float32Array(analyser.fftSize);
        const recent: number[] = [];
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          if (rms === 0) return; // exact silence = the mic hasn't started delivering yet
          recent.push(20 * Math.log10(rms));
          if (recent.length > WINDOW) recent.shift();
          if (recent.length >= MIN_SAMPLES) setOut({ db: recent.reduce((s, v) => s + v, 0) / recent.length, mic: mic.label });
        }, SAMPLE_MS);
        cleanup = () => {
          clearInterval(timer);
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
        };
        if (stopped) cleanup();
      } catch (e) {
        // our own messages are plain Errors; the browser's are DOMExceptions like NotAllowedError
        const ours = e instanceof Error && e.name === "Error";
        if (!stopped) setOut({ error: ours ? e.message : "Couldn't open the microphone. Check Windows microphone privacy settings." });
      }
    })();
    return () => {
      stopped = true;
      cleanup();
      setOut({});
    };
  }, [on]);

  return out;
}
