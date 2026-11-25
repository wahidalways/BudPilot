import assert from "node:assert/strict";
import { test } from "node:test";

import { checkForUpdate, isNewer, newestApkRelease, type Release, releaseNotes, shortVersion, whatsNew } from "./updates.ts";

// Shono's releases as GitHub listed them on 2026-11-25 (newest first), trimmed
const apk = (v: string, digest = "sha256:ab") => ({ name: `Shono-${v}.apk`, browser_download_url: `https://github.com/wahidalways/Shono/releases/download/v${v}/Shono-${v}.apk`, size: 31_636_723, digest });
const RELEASES: Release[] = [
  { tag_name: "v1.0.1", html_url: "https://github.com/wahidalways/Shono/releases/tag/v1.0.1", body: "Shono 1.0.1 for Android: cooler.\r\n\r\n## What's better\r\n\r\n- **Cooler.** Less work.\r\n  - Nested.\r\n\r\n## Install\r\n\r\n1. Download it.", assets: [apk("1.0.1")] },
  { tag_name: "v1.0.0", assets: [apk("1.0.0")] },
  { tag_name: "v0.5.1", assets: [{ name: "Shono-Setup-0.5.1.exe", browser_download_url: "https://x/y.exe" }] },
];

test("versions compare by number, and show short", () => {
  assert.equal(isNewer("v1.0.2", "1.0.1"), true);
  assert.equal(isNewer("1.0.10", "1.0.9"), true);
  assert.equal(isNewer("v1.0", "1.0.0"), false);
  assert.equal(isNewer("1.0.1", "1.0.1"), false);
  assert.equal(shortVersion("v1.1.0"), "1.1");
  assert.equal(shortVersion("1.0.1"), "1.0.1");
});

test("the newest release with an APK counts: a Windows-only release, a draft or a pre-release doesn't", () => {
  assert.equal(newestApkRelease(RELEASES)?.version, "1.0.1");
  const windowsNewer: Release[] = [{ tag_name: "v1.1.0", assets: [{ name: "Shono-Setup-1.1.0.exe", browser_download_url: "https://x" }] }, ...RELEASES];
  assert.equal(newestApkRelease(windowsNewer)?.version, "1.0.1");
  assert.equal(newestApkRelease([{ ...RELEASES[0], tag_name: "v2.0.0", draft: true }, ...RELEASES])?.version, "1.0.1");
  assert.equal(newestApkRelease([{ ...RELEASES[0], tag_name: "v2.0.0", prerelease: true }, ...RELEASES])?.version, "1.0.1");
  assert.equal(newestApkRelease([])?.version, undefined);
  const u = newestApkRelease(RELEASES)!;
  assert.equal(u.apkName, "Shono-1.0.1.apk");
  assert.equal(u.apkSha256, "sha256:ab");
  assert.equal(u.notes, "Shono 1.0.1 for Android: cooler.\n\n## What's better\n\n• Cooler. Less work.\n• Nested.");
});

test("the check: available when newer, latest when not, error when GitHub can't be read", async () => {
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  assert.equal((await checkForUpdate("1.0.0", ok(RELEASES))).status, "available");
  assert.equal((await checkForUpdate("1.0.1", ok(RELEASES))).status, "latest");
  assert.equal((await checkForUpdate("1.0.1", (async () => new Response("", { status: 403 })) as typeof fetch)).status, "error");
  assert.equal((await checkForUpdate("1.0.1", (async () => Promise.reject(new Error("offline"))) as typeof fetch)).status, "error");
});

test("notes stop before the install steps, and long ones are cut at a line", () => {
  assert.equal(whatsNew("New things\n\n## Install\n\n1. Download"), "New things");
  assert.equal(whatsNew("**Install:** tap it"), "");
  const long = releaseNotes(Array.from({ length: 200 }, (_, i) => `- line ${i}`).join("\n"), 100);
  assert.ok(long.length <= 102 && long.endsWith("…"));
});
