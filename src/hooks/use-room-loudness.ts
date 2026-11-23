export type RoomLoudness = { db?: number; mic?: string; error?: string };

// shortcut: no microphone metering on Android yet; add it with the Android BLE transport.
export function useRoomLoudness(on: boolean): RoomLoudness {
  return on ? { error: "Adaptive works in Shono for Windows for now." } : {};
}
