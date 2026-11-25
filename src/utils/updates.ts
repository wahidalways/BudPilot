// Check for updates (App settings, and once a day by itself): asks GitHub for Shono's releases, the same way Muse does.
// Nothing about the person is sent. Shono's releases include Windows ones (an .exe), so the newest release with an APK
// counts, not simply the latest one.

const RELEASES = "https://api.github.com/repos/wahidalways/Shono/releases?per_page=15";

type Asset = { name?: string; browser_download_url?: string; size?: number; digest?: string | null };
export type Release = { tag_name?: string; html_url?: string; body?: string; published_at?: string; draft?: boolean; prerelease?: boolean; assets?: Asset[] };

export type Update = {
  version: string;
  /** The release page. */
  url: string;
  /** The APK, which Shono downloads and installs. */
  apkUrl: string;
  apkName: string;
  apkSize: number | null;
  /** GitHub's "sha256:..." fingerprint of the APK, checked before installing; null when GitHub has none. */
  apkSha256: string | null;
  notes: string;
  publishedAt: string | null;
};
export type UpdateCheck = { status: "latest" } | ({ status: "available" } & Update) | { status: "error" };

/** "v1.2.0" → [1, 2, 0]. */
const parts = (version: string) =>
  version
    .replace(/^v/i, "")
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);

/** How a version is shown: "1.1.0" reads "1.1"; "1.0.1" stays as it is. */
export const shortVersion = (version: string) => version.replace(/^v/i, "").replace(/^(\d+\.\d+)\.0$/, "$1");

/** True when `candidate` is a later version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

const apkOf = (r: Release) => r.assets?.find((a) => a.name?.toLowerCase().endsWith(".apk") && a.browser_download_url);

/** The newest published (not draft, not pre-release) release that has an APK, as an update; undefined when none. */
export function newestApkRelease(releases: Release[]): Update | undefined {
  let best: Update | undefined;
  for (const r of releases) {
    const apk = apkOf(r);
    if (r.draft || r.prerelease || !r.tag_name || !apk) continue;
    const version = r.tag_name.replace(/^v/i, "");
    if (best && !isNewer(version, best.version)) continue;
    best = {
      version,
      url: r.html_url ?? "",
      apkUrl: apk.browser_download_url!,
      apkName: apk.name!,
      apkSize: typeof apk.size === "number" ? apk.size : null,
      apkSha256: typeof apk.digest === "string" ? apk.digest : null,
      notes: releaseNotes(whatsNew(r.body ?? "")),
      publishedAt: r.published_at ?? null,
    };
  }
  return best;
}

/** Asks GitHub; `current` is this app's version. A captive portal or a weak signal can hold a request open: 12 s. */
export async function checkForUpdate(current: string, get: typeof fetch = fetch): Promise<UpdateCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await get(RELEASES, { headers: { Accept: "application/vnd.github+json" }, signal: controller.signal });
    if (!response.ok) return { status: "error" };
    const newest = newestApkRelease((await response.json()) as Release[]);
    return newest && isNewer(newest.version, current) ? { status: "available", ...newest } : { status: "latest" };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Only the changes from a release's text: the install steps and the notes after them are for the GitHub page. */
export function whatsNew(markdown: string): string {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const stop = lines.findIndex((line) => /^\s*(?:#+\s*)?(?:\*\*|__)?\s*install\b/i.test(line));
  return (stop === -1 ? lines : lines.slice(0, stop)).join("\n").trim();
}

/** Release notes (Markdown) as plain lines for the update sheet: headings kept as "## X", emphasis dropped, links as
 * their text, list items as bullets, runs of blank lines folded; long notes cut at a line. */
export function releaseNotes(markdown: string, limit = 1200): string {
  const lines = markdown
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s*/, "## ")
        .replace(/^\s*[-*+]\s+/, "• ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\*\*|__|`/g, "")
        .trimEnd(),
    )
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""));
  let text = lines.join("\n").trim();
  if (text.length > limit) {
    const cut = text.lastIndexOf("\n", limit);
    text = `${text.slice(0, cut > 0 ? cut : limit).trimEnd()}\n…`;
  }
  return text;
}
