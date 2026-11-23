// The only desktop features the page may use: Start with Windows, the window's two views (tray flyout and settings),
// its buttons, its theme, its frosted backdrop, and the earbuds' taps on Windows (volume-key presses, the
// play/pause fix), the connection log and whether Windows has the earbuds.
const { contextBridge, ipcRenderer } = require("electron");

const VIEWS = ["flyout", "settings"];
const ACTIONS = ["minimize", "maximize", "close", "settings", "flyout"];
const THEMES = ["system", "light", "dark"];

contextBridge.exposeInMainWorld("budpilotDesktop", {
  /** { view } at load time; later view changes arrive through onView */
  info: ipcRenderer.sendSync("desktop:info"),
  /** true / false, or null when it can't be set (the live test window isn't an installed app) */
  getStartWithWindows: () => ipcRenderer.invoke("start-with-windows:get"),
  setStartWithWindows: (on) => ipcRenderer.invoke("start-with-windows:set", !!on),
  onView: (cb) => {
    const listener = (_e, v) => VIEWS.includes(v) && cb(v);
    ipcRenderer.on("view", listener);
    return () => ipcRenderer.removeListener("view", listener);
  },
  window: (action) => ACTIONS.includes(action) && ipcRenderer.send("window", action),
  setFlyoutHeight: (h) => Number.isFinite(h) && ipcRenderer.send("flyout-height", h),
  setTheme: (t) => THEMES.includes(t) && ipcRenderer.send("theme", t),
  /** presses Windows' volume up (n > 0) or down key |n| times, at most 30 */
  volumeKeys: (n) => Number.isInteger(n) && n !== 0 && Math.abs(n) <= 30 && ipcRenderer.send("volume-keys", n),
  /** frosted glass: { x, y, screenW, screenH, stamp, wallpaper } (where the window sits on its screen, and a small
   * copy of the desktop wallpaper or null); onFrost sends the first five again whenever the window moves */
  frost: () => ipcRenderer.invoke("frost"),
  onFrost: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on("frost", listener);
    return () => ipcRenderer.removeListener("frost", listener);
  },
  /** Windows' volume (percent), whenever it moves while mediaTaps is on */
  onWindowsVolume: (cb) => {
    const listener = (_e, percent) => cb(percent);
    ipcRenderer.on("windows-volume", listener);
    return () => ipcRenderer.removeListener("windows-volume", listener);
  },
  /** on while the earbuds are connected: keeps their play/pause taps from being undone, and reports Windows' volume */
  mediaTaps: (on) => ipcRenderer.send("media-taps", !!on),
  /** a line for the connection log (%APPDATA%\BudPilot\connection.log) */
  log: (line) => typeof line === "string" && ipcRenderer.send("log", line),
  /** whether Windows has the earbuds connected (for sound); sent when it changes and after a reload */
  onPcLink: (cb) => {
    const listener = (_e, on) => cb(!!on);
    ipcRenderer.on("pc-link", listener);
    return () => ipcRenderer.removeListener("pc-link", listener);
  },
});
