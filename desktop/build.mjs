// Builds the Windows app: Expo web export -> desktop/web, the helper -> desktop/helper, then a per-user installer
// Shono-Setup-<version>.exe in desktop/release. An installer, not a portable exe: the portable one unpacked
// ~110 MB to a temp folder on every launch (13 s here, far more on an older laptop with a hard disk).
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build, Platform } from "electron-builder";

import { compileHelper } from "./helper/compile.mjs";

const desktop = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

rmSync(new URL("web", import.meta.url), { recursive: true, force: true });
execSync("npx expo export -p web --output-dir desktop/web", { cwd: root, stdio: "inherit" });
compileHelper();

await build({
  projectDir: desktop,
  targets: Platform.WINDOWS.createTarget("nsis"),
  config: {
    appId: "com.wahidalways.budpilot",
    productName: "Shono",
    copyright: "Copyright (c) 2026 wahidalways",
    extraMetadata: { version }, // one version for every platform: the root package.json
    files: ["main.js", "preload.js", "icon.ico", "tray-light.ico", "tray-dark.ico", "web/**/*"],
    extraResources: [{ from: "helper/shono-helper.exe", to: "shono-helper.exe" }],
    electronLanguages: ["en-US"], // Chromium's other 54 languages are 48 MB the app never shows
    compression: "maximum",
    // WebGPU's shader compiler (25 MB): Shono draws nothing with WebGPU; D3D11 (d3dcompiler_47) and the software
    // fallback (SwiftShader) stay, for older and GPU-less machines
    afterPack: async ({ appOutDir }) => rmSync(path.join(appOutDir, "dxcompiler.dll"), { force: true }),
    directories: { output: "release" },
    win: { icon: "icon.ico" }, // Shono's mark, 16 to 256 px
    nsis: {
      oneClick: true, // no wizard: installs for this user only, no admin rights, then starts Shono
      perMachine: false,
      runAfterFinish: true,
      shortcutName: "Shono",
      artifactName: "Shono-Setup-${version}.exe",
      deleteAppDataOnUninstall: false, // keeps the saved settings and the connection log
    },
  },
});
