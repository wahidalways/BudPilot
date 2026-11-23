// BudPilot for Windows: an Electron window around the Expo web build, talking to the earbuds over Web Bluetooth.
// It lives in the tray, so it can keep the noise setting the user picked: the earbuds' firmware switches ANC on by
// itself every time they power up, and only a running BudPilot can switch it back.
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme, net, protocol, screen, session, shell } = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
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
const LOGIN = { path: EXE, args: ["--hidden"] };

// An opaque window: in a see-through one Chromium turns ClearType off and every word looks soft. The page paints its
// own frosted glass (see "frost" below); these match its base colors, so resizing never flashes another color.
const BACKGROUND = { light: "#F3F4F7", dark: "#141519" };
const background = () => (nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light);
// The taskbar and notifications know BudPilot by this. Windows remembers an icon per id for good, and under the old
// ids it remembered a wrong one (the button showed up before its icon was set); live mode has its own id, so
// Electron's icon can never stick to the real app's.
const APP_ID = app.isPackaged ? "wahidalways.BudPilot.App" : "wahidalways.BudPilot.Dev";
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

if (!app.requestSingleInstanceLock()) process.exit(0); // already running: the first copy shows itself
app.on("second-instance", () => showSettings());

// "secure" makes app:// a secure context, which Web Bluetooth requires.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function placeFlyout() {
  const { workArea: wa } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const height = Math.min(flyoutHeight, wa.height - 2 * EDGE);
  win.setBounds({ x: wa.x + wa.width - FLYOUT_W - EDGE, y: wa.y + wa.height - height - EDGE, width: FLYOUT_W, height });
}

// The taskbar button: BudPilot's name and mark, not those of whatever exe runs it (Electron's atom in live mode).
// Windows ignores the icon unless a relaunch command comes with it, and forgets all of it when the button is
// rebuilt (leaving the flyout view), so this runs again each time.
const ICON = path.join(__dirname, "icon.ico");
function brandTaskbar() {
  if (process.platform !== "win32") return;
  const relaunchCommand = app.isPackaged ? `"${EXE}"` : `"${process.execPath}" "${app.getAppPath()}"`;
  win.setAppDetails({ appId: APP_ID, appIconPath: ICON, appIconIndex: 0, relaunchCommand, relaunchDisplayName: "BudPilot" });
  win.setIcon(ICON);
}

function setView(next) {
  if (view === "settings" && next !== "settings" && win.isVisible() && !win.isMaximized()) settingsBounds = win.getBounds();
  view = next;
  const flyout = next === "flyout";
  win.webContents.send("view", next);
  if (win.isMaximized()) win.unmaximize();
  win.setAlwaysOnTop(flyout);
  win.setSkipTaskbar(flyout);
  if (!flyout) brandTaskbar();
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
    title: "BudPilot",
    icon: ICON,
    show: false, // shown below, once Windows has the taskbar button's icon
    frame: false, // the page draws its own title bar
    autoHideMenuBar: true,
    backgroundColor: background(),
    // keep watching the earbuds while hidden
    webPreferences: { backgroundThrottling: false, preload: path.join(__dirname, "preload.js") },
  });
  brandTaskbar();
  for (const moved of ["move", "resize", "show"]) win.on(moved, sendPlace);
  win.on("show", readWallpaper); // it may have changed while BudPilot sat in the tray
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

  // links (the credits) open in the browser, never inside BudPilot
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

  // closing the window keeps BudPilot running in the tray; Quit is in the tray menu
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

// Bluetooth scanning needs a user gesture; the shell provides one so BudPilot can connect by itself.
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

// Whether Windows has the earbuds connected (for sound), checked every 3 s: BudPilot tries to connect the moment
// they are, and can tell "connected to Windows but not answering BudPilot" apart from "in the case or out of range".
const PC_LINK_PS = `
$key = '{83DA6326-97A6-4088-9453-A1923F573B29} 15'
$id = $null
while ($true) {
  if (-not $id) { $id = (Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like 'HOCO EQ35*' -and $_.InstanceId -like 'BTHENUM\\DEV_*' } | Select-Object -First 1).InstanceId }
  $on = [bool]$id -and [bool](Get-PnpDeviceProperty -InstanceId $id -KeyName $key -ErrorAction SilentlyContinue).Data
  [Console]::Out.WriteLine([int]$on)
  Start-Sleep -Seconds 3
}`;
let pcLinked;
function watchPcLink() {
  if (process.platform !== "win32") return;
  const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(PC_LINK_PS, "utf16le").toString("base64")], { windowsHide: true });
  const tell = () => pcLinked !== undefined && win?.webContents.send("pc-link", pcLinked);
  ps.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      const t = line.trim();
      if ((t !== "0" && t !== "1") || (t === "1") === pcLinked) continue;
      pcLinked = t === "1";
      log(pcLinked ? "windows: earbuds connected" : "windows: earbuds disconnected");
      tell();
      if (pcLinked) autoConnect();
    }
  });
  win.webContents.on("did-finish-load", tell); // a reload forgets it
  app.on("before-quit", () => ps.kill());
}

// Game mode's auto switch: Windows' own "user notification state" says when something runs full screen
// (2 = a full-screen app such as a borderless game or a video, 3 = a full-screen Direct3D game).
const FULLSCREEN_PS =
  "Add-Type -Namespace W -Name N -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern int SHQueryUserNotificationState(out int s);';" +
  " while ($true) { $s = 0; [void][W.N]::SHQueryUserNotificationState([ref]$s); [Console]::Out.WriteLine($s); Start-Sleep -Seconds 3 }";

function watchFullscreen() {
  if (process.platform !== "win32") return;
  const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", FULLSCREEN_PS], { windowsHide: true });
  let full;
  const tell = () => {
    if (full !== undefined) win?.webContents.executeJavaScript(`globalThis.__budpilotFullscreen?.(${full})`).catch(() => {});
  };
  ps.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      const state = line.trim();
      if (!state) continue;
      const now = state === "2" || state === "3";
      if (now !== full) {
        full = now;
        tell();
      }
    }
  });
  win.webContents.on("did-finish-load", tell); // a reload forgets it
  app.on("before-quit", () => ps.kill());
}

// The earbuds' volume taps, passed on as Windows volume-key presses (so Windows changes and shows its volume): the
// earbuds keep their own volume and never tell Windows. One PowerShell stays ready; each stdin line is +n / -n presses.
const VOLUME_KEYS_PS =
  "Add-Type -Namespace W -Name K -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte k, byte s, int f, int e);';" +
  " while ($null -ne ($l = [Console]::In.ReadLine())) { $n = [int]$l; $k = if ($n -gt 0) { 0xAF } else { 0xAE };" +
  " for ($i = 0; $i -lt [Math]::Abs($n); $i++) { [W.K]::keybd_event($k, 0, 0, 0); [W.K]::keybd_event($k, 0, 2, 0) } }";
let volumeKeys;
function pressVolumeKeys(n) {
  if (process.platform !== "win32") return;
  if (!volumeKeys || volumeKeys.exitCode !== null) {
    volumeKeys = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", VOLUME_KEYS_PS], { windowsHide: true });
    volumeKeys.on("error", () => (volumeKeys = undefined));
  }
  volumeKeys.stdin.write(`${n}\n`);
}
ipcMain.on("volume-keys", (_e, n) => Number.isInteger(n) && n !== 0 && Math.abs(n) <= 30 && pressVolumeKeys(n));
app.on("before-quit", () => volumeKeys?.kill());

// Windows acts twice on the earbuds' play/pause tap: seen 2026-11-22, every tap paused Chrome and 0.19-0.23 s later
// it played again (so a paused video never resumed), while Windows' own Play/Pause key acts once. While the earbuds
// are connected, this watches the playing app (Windows' media sessions) and, when a play/pause flip flips straight
// back, puts it back the way the tap meant.
// It also reports Windows' own volume whenever it moves ("vol 64"): the page must not mistake what follows in the
// earbuds for a volume tap (Windows hands them its volume while sound plays).
const MEDIA_TAPS_PS = `
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
$t = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()))
$t.Wait(-1) | Out-Null
$mgr = $t.Result
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class BudEnumCo {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IBudEnum { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IBudDevice dev); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IBudDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IBudVolume { int f1(); int f2(); int f3(); int f4(); int f5(); int f6(); [PreserveSig] int GetMasterVolumeLevelScalar(out float level); }
public static class BudVol {
  public static float Get() { var e = (IBudEnum)(new BudEnumCo()); IBudDevice d; e.GetDefaultAudioEndpoint(0, 1, out d);
    var iid = typeof(IBudVolume).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o); float l; ((IBudVolume)o).GetMasterVolumeLevelScalar(out l); return l; }
}
"@
$app = $null; $last = $null; $before = $null; $flippedAt = [DateTime]::MinValue; $quietUntil = [DateTime]::MinValue
$tick = 0; $vol = -1
while ($true) {
  Start-Sleep -Milliseconds 40
  if ((++$tick % 5) -eq 0) { try { $v = [int][Math]::Round([BudVol]::Get() * 100); if ($v -ne $vol) { $vol = $v; [Console]::Out.WriteLine("vol $v") } } catch {} }
  try {
    $s = $mgr.GetCurrentSession()
    if (-not $s) { $last = $null; continue }
    if ($s.SourceAppUserModelId -ne $app) { $app = $s.SourceAppUserModelId; $last = $null }
    $st = [string]$s.GetPlaybackInfo().PlaybackStatus
    if ($st -ne 'Playing' -and $st -ne 'Paused') { continue }
    $now = [DateTime]::Now
    if ($null -eq $last -or $st -eq $last) { $last = $st; continue }
    if ($now -lt $quietUntil) { $last = $st; continue }
    if ($st -eq $before -and ($now - $flippedAt).TotalMilliseconds -lt 450) {
      if ($last -eq 'Paused') { [void]$s.TryPauseAsync() } else { [void]$s.TryPlayAsync() }
      [Console]::Out.WriteLine("kept $last")
      $quietUntil = $now.AddMilliseconds(700); $before = $null; $last = $st; continue
    }
    $before = $last; $last = $st; $flippedAt = $now
  } catch { $last = $null }
}`;
let mediaTaps;
ipcMain.on("media-taps", (_e, on) => {
  if (process.platform !== "win32" || !!on === !!mediaTaps) return;
  if (!on) return void (mediaTaps.kill(), (mediaTaps = undefined));
  const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(MEDIA_TAPS_PS, "utf16le").toString("base64")], { windowsHide: true });
  ps.on("exit", () => mediaTaps === ps && (mediaTaps = undefined));
  ps.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      const vol = /^vol (\d+)$/.exec(line.trim());
      if (vol) win?.webContents.send("windows-volume", Number(vol[1]));
      else if (DEV_URL && line.trim()) console.log("media taps:", line.trim());
    }
  });
  mediaTaps = ps;
});
app.on("before-quit", () => mediaTaps?.kill());

// Start with Windows (installed app only; the live test window isn't something Windows should start)
const startsWithWindows = () => app.getLoginItemSettings(LOGIN).openAtLogin;
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
// the window follows BudPilot's own theme choice
ipcMain.on("theme", (_e, t) => {
  if (!["system", "light", "dark"].includes(t)) return;
  nativeTheme.themeSource = t;
  win?.setBackgroundColor(background());
});

let tray; // kept referenced, or the tray icon disappears
function updateTrayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open BudPilot", click: showSettings },
      ...(app.isPackaged ? [{ label: "Start with Windows", type: "checkbox", checked: startsWithWindows(), click: (item) => setStartWithWindows(item.checked) }] : []),
      { type: "separator" },
      {
        label: "Quit BudPilot",
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
nativeTheme.on("updated", () => tray?.setImage(trayIcon())); // the taskbar's theme can change while BudPilot runs

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("BudPilot: keeps your noise setting");
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
    // Start with Windows is on by default (first run only, so turning it off sticks)
    const firstRun = path.join(app.getPath("userData"), "first-run-done");
    if (!fs.existsSync(firstRun)) {
      app.setLoginItemSettings({ ...LOGIN, openAtLogin: true });
      fs.writeFileSync(firstRun, "");
    }
    // when it's on but points at another copy (an older exe), point it at this one
    const items = app.getLoginItemSettings(LOGIN).launchItems ?? [];
    if (items.some((i) => i.enabled && i.path.toLowerCase() !== EXE.toLowerCase())) app.setLoginItemSettings({ ...LOGIN, openAtLogin: true });
  }
  log(`BudPilot ${app.getVersion()} started${HIDDEN ? " with Windows" : ""}`);
  createWindow();
  watchFullscreen();
  watchPcLink();
  createTray();
});

app.on("before-quit", () => (quitting = true));
app.on("window-all-closed", () => {}); // keep running in the tray
