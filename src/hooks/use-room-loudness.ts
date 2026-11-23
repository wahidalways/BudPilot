export type RoomLoudness = { db?: number; mic?: string; error?: string };

// No microphone metering on phones: Adaptive is Windows-only by the user's choice, and phones hide it (PHONE_STRENGTHS).
export function useRoomLoudness(on: boolean): RoomLoudness {
  return on ? { error: "Adaptive works in Shono for Windows for now." } : {};
}
