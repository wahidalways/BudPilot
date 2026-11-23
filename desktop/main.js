// Shono for Windows: an Electron window around the Expo web build, talking to the earbuds over Web Bluetooth.
// It lives in the tray, so it can keep the noise setting the user picked: the earbuds' firmware switches ANC on by
// itself every time they power up, and only a running Shono can switch it back.
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme, net, protocol, screen, session, shell } = require("electron");
const { execFile, execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const readline = require("node:readline");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

if (!protocol) throw new Error("Electron started as plain Node: clear the ELECTRON_RUN_AS_NODE environment variable and run again.");

const WEB = path.join(__dirname, "web");
const DEV_URL = process.argv.includes("--dev") ? "http://localhost:8081" : undefined; // `npx expo start --web`
const HIDDEN = process.argv.includes("--hidden"); // started with Windows: stay in the tray
// shortcut: auto-picks the first supported model; add a device chooser when more models are supported.
const SUPPORTED = /^HOCO EQ35/i;
const SCAN_MS = 15000;
const AUTO_CONNECT_MS = 5000;
// the portable exe runs from a temp copy; Windows must start the real file
const EXE = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath;
// Start with Windows: one entry, under a fixed name (Electron's default name follows the app's name and id, so the
// rename would have left the old entry behind and started both apps)
const LOGIN = { path: EXE, args: ["--hidden"], name: "Shono" };
const OLD_LOGIN = "electron.app.BudPilot"; // BudPilot's entry, pointing at whichever exe set it (a portable 0.3.1 here)
const RUN = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

// An opaque window: in a see-through one Chromium turns ClearType off and every word looks soft. The page paints its
// own frosted glass (see "frost" below); these match its base colors, so resizing never flashes another color.
const BACKGROUND = { light: "#F3F4F7", dark: "#141519" };
const background = () => (nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light);
// The taskbar and notifications know Shono by this. Windows remembers an icon per id for good, and under the old
// ids it remembered wrong ones (the atom; a blank page, when the icon path pointed inside app.asar), so the installed
// app uses the id its installer gives the Start menu shortcut (electron-builder's appId): taskbar, notifications and
// shortcut agree. Live mode has its own id, so Electron's icon can never stick to the real app's.
const APP_ID = app.isPackaged ? "com.wahidalways.budpilot" : "wahidalways.Shono.Dev";
const FLYOUT_W = 360;
const SETTINGS = { width: 900, height: 660 };
const EDGE = 12; // the flyout's gap from the taskbar and the screen edge, like Windows' own flyouts

let win;
let quitting = false;
// One window holds the Bluetooth link, so it shows two views: the tray flyout and the settings window.
let view = HIDDEN ? "flyout" : "settings";
let flyoutHeight = 520; // the page reports its real height
let settingsBounds; // where the user left the settings window
let hiddenAt = 0;

// The settings folder keeps the app's first name: the saved settings, the connection log and the Start with Windows
// marker are in %APPDATA%\BudPilot, and the rename to Shono (2026-11-23) mustn't lose them. Before the lock, which
// lives in this folder too.
app.setPath("userData", path.join(app.getPath("appData"), "BudPilot"));

if (!app.requestSingleInstanceLock()) process.exit(0); // already running: the first copy shows itself
app.on("second-instance", () => showSettings());

// "secure" makes app:// a secure context, which Web Bluetooth requires; "codeCache" keeps V8's compiled copy of the
// page's JavaScript between starts (Chromium does that only for http(s) unless a scheme asks), so it isn't
// compiled again on every start.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }]);

function placeFlyout() {
  const { workArea: wa } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const height = Math.min(flyoutHeight, wa.height - 2 * EDGE);
  win.setBounds({ x: wa.x + wa.width - FLYOUT_W - EDGE, y: wa.y + wa.height - height - EDGE, width: FLYOUT_W, height });
}

// The taskbar button: Shono's name and mark, not those of whatever exe runs it (Electron's atom in live mode).
// Windows ignores the icon unless a relaunch command comes with it. It has to be in place BEFORE the button exists
// (leaving the flyout view makes a new one): a button made without it shows the exe's icon, and Windows then keeps
// that icon for the id (the atom the user saw on opening settings, 2026-11-23).
const ICON = path.join(__dirname, "icon.ico");
function brandTaskbar() {
  if (process.platform !== "win32") return;
  const relaunchCommand = app.isPackaged ? `"${EXE}"` : `"${process.execPath}" "${app.getAppPath()}"`;
  // the shell reads appIconPath itself, and can't see inside app.asar (that gave a blank page): the packaged exe carries
  // the icon, and in live mode icon.ico is a real file
  win.setAppDetails({ appId: APP_ID, appIconPath: app.isPackaged ? EXE : ICON, appIconIndex: 0, relaunchCommand, relaunchDisplayName: "Shono" });
  win.setIcon(ICON);
}

function setView(next) {
  if (view === "settings" && next !== "settings" && win.isVisible() && !win.isMaximized()) settingsBounds = win.getBounds();
  view = next;
  const flyout = next === "flyout";
  win.webContents.send("view", next);
  if (win.isMaximized()) win.unmaximize();
  win.setAlwaysOnTop(flyout);
  if (!flyout) brandTaskbar(); // before the button appears (see brandTaskbar)
  win.setSkipTaskbar(flyout);
  win.setResizable(!flyout);
  if (flyout) placeFlyout();
  else win.setBounds(settingsBounds ?? { ...SETTINGS, ...centered(SETTINGS) });
}

function centered({ width, height }) {
  const { workArea: wa } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return { x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2) };
}

function showFlyout() {
  if (win.isMinimized()) win.restore(); // show() alone leaves a minimized window down in the taskbar
  if (view !== "flyout") setView("flyout");
  else placeFlyout();
  win.show();
  win.focus();
}

function showSettings() {
  if (win.isMinimized()) win.restore();
  if (view !== "settings") setView("settings");
  win.show();
  win.moveTop(); // Windows keeps the active app in front otherwise (opened from the tray, a second launch, a notification)
  win.focus();
}

function createWindow() {
  const settings = { ...SETTINGS, ...centered(SETTINGS) };
  win = new BrowserWindow({
    ...(view === "settings" ? settings : { width: FLYOUT_W, height: flyoutHeight }),
    minWidth: FLYOUT_W,
    minHeight: 240,
    title: "Shono",
    icon: ICON,
    show: false, // shown below, once Windows has the taskbar button's icon
    frame: false, // the page draws its own title bar
    autoHideMenuBar: true,
    backgroundColor: background(),
    // keep watching the earbuds while hidden; no spellchecker (its dictionaries cost memory, and the one text box is an
    // EQ's name)
    webPreferences: { backgroundThrottling: false, spellcheck: false, preload: path.join(__dirname, "preload.js") },
  });
  brandTaskbar();
  for (const moved of ["move", "resize", "show"]) win.on(moved, sendPlace);
  win.on("show", readWallpaper); // it may have changed while Shono sat in the tray
  readWallpaper();
  if (!HIDDEN) win.show();
  if (view === "flyout") {
    win.setAlwaysOnTop(true);
    win.setSkipTaskbar(true);
    win.setResizable(false);
  }

  // the flyout goes away when you click elsewhere, like Windows' own
  win.on("blur", () => {
    if (view !== "flyout" || win.webContents.isDevToolsFocused()) return;
    win.hide();
    hiddenAt = Date.now();
  });

  // links (the credits) open in the browser, never inside Shono
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  // Web Bluetooth asks the embedder to pick a device; without this handler requestDevice never resolves.
  let scanTimer;
  let seen; // the last scan's result: logged when it changes, so the log shows when the earbuds stop advertising
  win.webContents.on("select-bluetooth-device", (event, devices, callback) => {
    event.preventDefault();
    const found = devices.find((d) => SUPPORTED.test(d.deviceName));
    if (found) {
      clearTimeout(scanTimer);
      scanTimer = undefined;
      if (seen !== found.deviceId) log(`scan: found ${found.deviceName} (${found.deviceId})`);
      seen = found.deviceId;
      callback(found.deviceId);
    } else if (!scanTimer) {
      scanTimer = setTimeout(() => {
        scanTimer = undefined;
        if (seen !== null) log(`scan: earbuds not advertising (nothing for ${SCAN_MS / 1000} s)`);
        seen = null;
        callback(""); // cancels: the app keeps waiting, or shows "Couldn't find your earbuds" after a click
      }, SCAN_MS);
    }
  });

  win.webContents.on("did-finish-load", autoConnect);
  setInterval(autoConnect, AUTO_CONNECT_MS);

  // closing the window keeps Shono running in the tray; Quit is in the tray menu
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });

  // live mode: if the dev server isn't up yet, keep retrying instead of showing a blank window
  if (DEV_URL) win.webContents.on("did-fail-load", () => setTimeout(() => win.loadURL(DEV_URL), 1500));
  win.loadURL(DEV_URL ?? "app://budpilot/");
}

// Frost: the frosted-glass look without a see-through window. The page gets a small copy of the desktop wallpaper
// and where the window sits on its screen, and paints the wallpaper itself, blurred and lined up with the real one
// behind the window (what Windows' Mica does). No picture wallpaper: the page uses a soft backdrop of its own.
let wallpaper = { key: "", url: null }; // key: file + when it changed
function readWallpaper() {
  if (process.platform !== "win32") return;
  execFile("reg", ["query", "HKCU\\Control Panel\\Desktop", "/v", "WallPaper"], { windowsHide: true }, (err, out) => {
    let next = { key: "", url: null };
    try {
      const file = err ? undefined : /WallPaper\s+REG_SZ\s+(.+)/i.exec(out)?.[1]?.trim();
      if (file) {
        const key = `${file}|${fs.statSync(file).mtimeMs}`;
        if (key === wallpaper.key) return;
        const image = nativeImage.createFromBuffer(fs.readFileSync(file)); // JPEG or PNG; others fall back
        if (!image.isEmpty()) next = { key, url: `data:image/jpeg;base64,${image.resize({ width: 480 }).toJPEG(84).toString("base64")}` };
      }
    } catch {
      // unreadable: no wallpaper
    }
    if (next.key === wallpaper.key) return;
    wallpaper = next;
    sendPlace();
  });
}
/** Where the window sits on its screen (the page's units), and which wallpaper it should be showing. */
function place() {
  const b = win.getBounds();
  const d = screen.getDisplayMatching(b).bounds;
  return { x: b.x - d.x, y: b.y - d.y, screenW: d.width, screenH: d.height, stamp: wallpaper.key };
}
function sendPlace() {
  if (win && !win.isDestroyed()) win.webContents.send("frost", place());
}
ipcMain.handle("frost", () => ({ ...place(), wallpaper: wallpaper.url }));

// Bluetooth scanning needs a user gesture; the shell provides one so Shono can connect by itself.
const autoConnect = () => win?.webContents.executeJavaScript("globalThis.__budpilotAutoConnect?.()", true).catch(() => {});

// Why links drop, in a file that outlives reloads and new versions: %APPDATA%\BudPilot\connection.log (the page
// logs its side through IPC). Past LOG_MAX it moves to connection.old.log, so it never grows without end.
const LOG_MAX = 512 * 1024;
let logFile;
function log(line) {
  logFile ??= path.join(app.getPath("userData"), "connection.log");
  const d = new Date();
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > LOG_MAX) fs.renameSync(logFile, logFile.replace(/\.log$/, ".old.log"));
    fs.appendFileSync(logFile, `${d.toLocaleString("sv-SE")}.${String(d.getMilliseconds()).padStart(3, "0")} ${line}\n`);
  } catch {}
}
ipcMain.on("log", (_e, line) => typeof line === "string" && log(line.slice(0, 600)));

// One small helper process does Shono's Windows-only watching (desktop/helper/helper.cs):
// - whether something runs full screen (Game mode's auto switch);
// - whether Windows has the earbuds connected (Shono connects the moment they are, and can tell "connected to
//   Windows but not answering Shono" apart from "in the case or out of range");
// - the earbuds' volume taps, passed on as Windows volume keys (the earbuds keep their own volume);
// - the play/pause fix: Windows acts twice on the earbuds' tap (seen 2026-11-22: paused, then played 0.19-0.23 s
//   later), so a flip that flips straight back is put back; with it, Windows' own volume, so the page doesn't take
//   what follows in the earbuds for a volume tap.
// It replaced four PowerShells (~330 MB, a 25-times-a-second media poll) and exits when Shono closes its stdin.
const HELPER = app.isPackaged ? path.join(process.resourcesPath, "shono-helper.exe") : path.join(__dirname, "helper", "shono-helper.exe");
let helper;
let full; // something runs full screen
let pcLinked; // Windows has the earbuds connected (for sound)
let tapsWanted = false;
const tellFull = () => full !== undefined && win?.webContents.executeJavaScript(`globalThis.__budpilotFullscreen?.(${full})`).catch(() => {});
const tellPcLink = () => pcLinked !== undefined && win?.webContents.send("pc-link", pcLinked);
const toHelper = (line) => helper?.stdin.writable && helper.stdin.write(`${line}\n`);

function startHelper() {
  if (process.platform !== "win32") return;
  if (!fs.existsSync(HELPER)) return log(`helper missing (${HELPER}): no full-screen, Windows link, volume-key or play/pause help`);
  const h = spawn(HELPER, [SUPPORTED.source.replace(/^\^/, "")], { windowsHide: true });
  helper = h;
  h.on("error", (e) => log(`helper failed to start: ${e.message}`));
  h.on("exit", (code) => {
    if (helper !== h) return;
    helper = undefined;
    if (quitting) return;
    log(`helper stopped (${code}); starting it again`);
    setTimeout(startHelper, 5000);
  });
  readline.createInterface({ input: h.stdout }).on("line", (line) => {
    const [what, value = ""] = line.trim().split(" ");
    if (what === "full") {
      full = value === "1";
      tellFull();
    } else if (what === "pc") {
      pcLinked = value === "1";
      log(pcLinked ? "windows: earbuds connected" : "windows: earbuds disconnected");
      tellPcLink();
      if (pcLinked) autoConnect();
    } else if (what === "vol") win?.webContents.send("windows-volume", Number(value));
    else if (what === "error") log(`helper: ${line.slice(6)}`);
    else if (what === "settings") log("windows: the Settings app came to the front");
    else if (DEV_URL && line.trim()) console.log("helper:", line.trim());
  });
  if (tapsWanted) toHelper("taps 1");
}
ipcMain.on("volume-keys", (_e, n) => Number.isInteger(n) && n !== 0 && Math.abs(n) <= 30 && toHelper(`keys ${n}`));
ipcMain.on("media-taps", (_e, on) => {
  tapsWanted = !!on;
  toHelper(`taps ${tapsWanted ? 1 : 0}`);
});
app.on("before-quit", () => helper?.stdin.end()); // it exits when its stdin closes

// Start with Windows (installed app only; the live test window isn't something Windows should start)
/** What Windows starts at sign-in under `name`, or undefined. */
function runEntry(name) {
  try {
    return /REG_SZ\s+(.+)/.exec(execFileSync("reg", ["query", RUN, "/v", name], { windowsHide: true, encoding: "utf8" }))?.[1]?.trim();
  } catch {
    return undefined; // no such entry
  }
}
const startsWithWindows = () => !!runEntry(LOGIN.name)?.toLowerCase().includes(EXE.toLowerCase());
function setStartWithWindows(on) {
  app.setLoginItemSettings({ ...LOGIN, openAtLogin: on });
  updateTrayMenu();
  win?.webContents.executeJavaScript(`globalThis.__budpilotStartWithWindows?.(${startsWithWindows()})`).catch(() => {});
  return startsWithWindows();
}
ipcMain.handle("start-with-windows:get", () => (app.isPackaged ? startsWithWindows() : null));
ipcMain.handle("start-with-windows:set", (_e, on) => (app.isPackaged ? setStartWithWindows(on) : null));

// the page's side of the two views
ipcMain.on("desktop:info", (e) => (e.returnValue = { view }));
ipcMain.on("flyout-height", (_e, h) => {
  flyoutHeight = Math.max(200, Math.min(1000, Math.round(h)));
  if (view === "flyout") placeFlyout();
});
ipcMain.on("window", (_e, action) => {
  if (action === "minimize") win.minimize();
  else if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === "close") win.hide(); // stays in the tray; Quit is in the tray menu
  else if (action === "settings") showSettings();
  else if (action === "flyout") showFlyout();
});
// the window follows Shono's own theme choice
ipcMain.on("theme", (_e, t) => {
  if (!["system", "light", "dark"].includes(t)) return;
  nativeTheme.themeSource = t;
  win?.setBackgroundColor(background());
});

let tray; // kept referenced, or the tray icon disappears
function updateTrayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Shono", click: showSettings },
      ...(app.isPackaged ? [{ label: "Start with Windows", type: "checkbox", checked: startsWithWindows(), click: (item) => setStartWithWindows(item.checked) }] : []),
      { type: "separator" },
      {
        label: "Quit Shono",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

// a line glyph like Windows' own tray icons, dark on a light taskbar and white on a dark one; each .ico has one
// hand-tuned image per size, since Windows takes the exact size it shows (20 px at 125%), never a stretched one
const trayIcon = () => path.join(__dirname, nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? "tray-dark.ico" : "tray-light.ico");
nativeTheme.on("updated", () => tray?.setImage(trayIcon())); // the taskbar's theme can change while Shono runs

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("Shono: keeps your noise setting");
  tray.on("click", () => {
    // a click on the tray icon blurs an open flyout first; don't open it again straight away
    if (Date.now() - hiddenAt < 300) return;
    if (win.isVisible() && view === "flyout") win.hide();
    else showFlyout();
  });
  updateTrayMenu();
}

app.setAppUserModelId(APP_ID); // Windows shows notifications only for an app with an id
app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const file = path.join(WEB, decodeURIComponent(new URL(req.url).pathname));
    if (!file.startsWith(WEB)) return new Response("Not found", { status: 404 });
    // single-page export: anything that isn't a file is a route, served by index.html
    return net.fetch(pathToFileURL(path.extname(file) ? file : path.join(WEB, "index.html")).toString());
  });
  // Adaptive noise cancelling reads a microphone's loudness; camera and screen capture are refused.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(permission !== "media" || (details.mediaTypes ?? []).every((t) => t === "audio")),
  );
  if (app.isPackaged) {
    // Start with Windows: on by default (first run only, so turning it off sticks). BudPilot's old entry is replaced
    // by Shono's, on if it was on; and an entry pointing at another copy (an older or moved exe) points at this one.
    const firstRun = path.join(app.getPath("userData"), "first-run-done");
    const wasOn = !!runEntry(OLD_LOGIN);
    if (wasOn) {
      try {
        execFileSync("reg", ["delete", RUN, "/v", OLD_LOGIN, "/f"], { windowsHide: true });
      } catch (e) {
        log(`start with Windows: couldn't remove BudPilot's old entry: ${e.message}`);
      }
    }
    const mine = runEntry(LOGIN.name);
    if (!fs.existsSync(firstRun) || wasOn || (mine && !startsWithWindows())) app.setLoginItemSettings({ ...LOGIN, openAtLogin: true });
    if (!fs.existsSync(firstRun)) fs.writeFileSync(firstRun, "");
    log(`start with Windows: ${startsWithWindows() ? "on" : "off"}${wasOn ? " (moved from BudPilot's old entry)" : ""}`);
  }
  log(`Shono ${app.getVersion()} started${HIDDEN ? " with Windows" : ""}`);
  createWindow();
  startHelper();
  win.webContents.on("did-finish-load", () => (tellFull(), tellPcLink())); // a reload forgets both
  createTray();
});

app.on("before-quit", () => (quitting = true));
app.on("window-all-closed", () => {}); // keep running in the tray
