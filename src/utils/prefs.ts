// Small settings kept on this device. Storage can be missing or blocked, so every access is guarded.
// Android gets localStorage from expo-sqlite (installed in app.native.tsx), so the keys are the same as on Windows.

export function loadPref<T>(key: string): T | undefined {
  try {
    const v = globalThis.localStorage?.getItem(key);
    return v ? (JSON.parse(v) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {}
}
