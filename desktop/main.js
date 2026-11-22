// BudPilot for Windows: an Electron window around the Expo web build, talking to the earbuds over Web Bluetooth.
const { app, BrowserWindow, nativeTheme, net, protocol } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

if (!protocol) throw new Error("Electron started as plain Node: clear the ELECTRON_RUN_AS_NODE environment variable and run again.");

const WEB = path.join(__dirname, "web");
const DEV_URL = process.argv.includes("--dev") ? "http://localhost:8081" : undefined; // `npx expo start --web`
// shortcut: auto-picks the first supported model; add a device chooser when more models are supported.
const SUPPORTED = /^HOCO EQ35/i;
const SCAN_MS = 15000;

// "secure" makes app:// a secure context, which Web Bluetooth requires.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function createWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    title: "BudPilot",
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0F1114" : "#F4F5F7",
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
        callback(""); // cancels: the app shows "Couldn't find your earbuds"
      }, SCAN_MS);
    }
  });

  win.loadURL(DEV_URL ?? "app://budpilot/");
}

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const file = path.join(WEB, decodeURIComponent(new URL(req.url).pathname));
    if (!file.startsWith(WEB)) return new Response("Not found", { status: 404 });
    // single-page export: anything that isn't a file is a route, served by index.html
    return net.fetch(pathToFileURL(path.extname(file) ? file : path.join(WEB, "index.html")).toString());
  });
  createWindow();
});

app.on("window-all-closed", () => app.quit());
