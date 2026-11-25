export type RoomLoudness = { db?: number; mic?: string; error?: string };

// No microphone metering on phones: Adaptive is Windows-only by the user's choice, and phones hide it (PHONE_STRENGTHS).
// the same objects every time: a new one per render made everything built on it new too (React's compiler skips this)
const OFF: RoomLoudness = {};
const WINDOWS_ONLY: RoomLoudness = { error: "Adaptive works in Shono for Windows for now." };
export function useRoomLoudness(on: boolean): RoomLoudness {
  return on ? WINDOWS_ONLY : OFF;
}
