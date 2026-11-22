// Small settings kept on this computer. Storage can be missing or blocked, so every access is guarded.
// shortcut: web/Electron localStorage only; Android needs AsyncStorage when its build starts.

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
