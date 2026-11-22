// Builds the Windows app: Expo web export -> desktop/web -> portable BudPilot-<version>.exe in desktop/release.
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { build, Platform } from "electron-builder";

const desktop = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

rmSync(new URL("web", import.meta.url), { recursive: true, force: true });
execSync("npx expo export -p web --output-dir desktop/web", { cwd: root, stdio: "inherit" });

await build({
  projectDir: desktop,
  targets: Platform.WINDOWS.createTarget("portable"),
  config: {
    appId: "com.wahidalways.budpilot",
    productName: "BudPilot",
    copyright: "Copyright (c) 2026 wahidalways",
    extraMetadata: { version }, // one version for every platform: the root package.json
    files: ["main.js", "web/**/*"],
    directories: { output: "release" },
    win: { icon: "../assets/images/icon.png" },
    portable: { artifactName: "BudPilot-${version}.exe" },
  },
});
