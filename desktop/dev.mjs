// `npm run dev`: the live Shono in one command. Starts the Expo dev server (no browser tab), waits until it
// answers, then opens the Electron window. Ctrl+C or quitting Shono from the tray stops both.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { compileHelper } from "./helper/compile.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const desktop = fileURLToPath(new URL(".", import.meta.url));
const URL_ = "http://localhost:8081/";
const env = { ...process.env }; // not CI=1: in CI mode Metro stops watching files, so edits never reach the window
delete env.ELECTRON_RUN_AS_NODE; // VS Code sets it; with it, Electron starts as plain Node

const children = [];
const run = (cmd, cwd) => {
  const child = spawn(cmd, { cwd, env, stdio: "inherit", shell: true });
  children.push(child);
  return child;
};
const stop = () => {
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // shell: true wraps the command, so end the whole process tree
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill();
  }
  process.exit(0);
};
process.on("SIGINT", stop);

const isUp = async () => {
  try {
    return (await fetch(URL_)).ok;
  } catch {
    return false;
  }
};

if (await isUp()) console.log("Dev server already running on 8081; reusing it.");
else run("npx expo start --port 8081", root);

console.log("Waiting for the dev server…");
while (!(await isUp())) await new Promise((r) => setTimeout(r, 1000));

compileHelper(); // the Windows helper (desktop/helper): rebuilt only when helper.cs changed
console.log("Opening Shono (live). Edits in src/ show up in the window.");
run(["npx electron . --dev", ...process.argv.slice(2)].join(" "), desktop).on("exit", stop); // extra args go to Electron
