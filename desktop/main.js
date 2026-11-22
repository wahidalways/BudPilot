// BudPilot for Windows: an Electron window around the Expo web build, talking to the earbuds over Web Bluetooth.
// It lives in the tray, so it can keep the noise setting the user picked: the earbuds' firmware switches ANC on by
// itself every time they power up, and only a running BudPilot can switch it back.
const { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, net, protocol, session } = require("electron");
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

let win;
let quitting = false;

if (!app.requestSingleInstanceLock()) process.exit(0); // already running: the first copy shows itself
app.on("second-instance", () => show());

// "secure" makes app:// a secure context, which Web Bluetooth requires.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function show() {
  win?.show();
  win?.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    title: "BudPilot",
    show: !HIDDEN,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0F1114" : "#F4F5F7",
    webPreferences: { backgroundThrottling: false }, // keep watching the earbuds while hidden
  });

  // Web Bluetooth asks the embedder to pick a device; without this handler requestDevice never resolves.
  let scanTimer;
  win.webContents.on("select-bluetooth-device", (event, devices, callback) => {
    event.preventDefault();
    const found = devices.find((d) => SUPPORTED.test(d.deviceName));
    if (found) {
      clearTimeout(scanTimer);
      scanTimer = undefined;
      callback(found.deviceId);
    } else if (!scanTimer) {
      scanTimer = setTimeout(() => {
        scanTimer = undefined;
        callback(""); // cancels: the app keeps waiting, or shows "Couldn't find your earbuds" after a click
      }, SCAN_MS);
    }
  });

  // Bluetooth scanning needs a user gesture; the shell provides one so BudPilot can connect by itself.
  const autoConnect = () => win.webContents.executeJavaScript("globalThis.__budpilotAutoConnect?.()", true).catch(() => {});
  win.webContents.on("did-finish-load", autoConnect);
  setInterval(autoConnect, AUTO_CONNECT_MS);

  // closing the window keeps BudPilot running in the tray; Quit is in the tray menu
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });

  win.loadURL(DEV_URL ?? "app://budpilot/");
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(WEB, "favicon.ico"));
  const tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("BudPilot: keeps your noise setting");
  const startWithWindows = app.isPackaged
    ? [{ label: "Start with Windows", type: "checkbox", checked: app.getLoginItemSettings(LOGIN).openAtLogin, click: (item) => app.setLoginItemSettings({ ...LOGIN, openAtLogin: item.checked }) }]
    : [];
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open BudPilot", click: show },
      ...startWithWindows,
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
  tray.on("click", show);
  return tray;
}

let tray; // kept referenced, or the tray icon disappears
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
  // Start with Windows is on by default (first run only, so turning it off in the tray sticks).
  const firstRun = path.join(app.getPath("userData"), "first-run-done");
  if (app.isPackaged && !fs.existsSync(firstRun)) {
    app.setLoginItemSettings({ ...LOGIN, openAtLogin: true });
    fs.writeFileSync(firstRun, "");
  }
  createWindow();
  tray = createTray();
});

app.on("before-quit", () => (quitting = true));
app.on("window-all-closed", () => {}); // keep running in the tray
