// Check for updates (the user, 2026-11-25), like Muse's: App settings › Updates checks GitHub on request, and once a day
// by itself when Shono opens (a switch). A new version opens a sheet with what's new; Download and install fetches the
// APK, checks its fingerprint and hands it to Android's installer (modules/shono-keeper UpdateInstaller.kt). Where
// Shono can't install (Expo Go, a browser), the button opens the download on GitHub instead.
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Linking, ScrollView, StyleSheet, View } from "react-native";

import { useColors } from "@/theme";
import { loadPref, savePref } from "@/utils/prefs";
import { checkForUpdate, shortVersion, type Update } from "@/utils/updates";

import appConfig from "../../app.json";
import { cancelUpdateDownload, canInstallUpdates, downloadUpdate, installUpdate, onUpdateProgress, onUpdateStatus } from "../../modules/shono-keeper";
import { Button, Card, CardHead, ToggleRow, Txt } from "./kit";
import { Sheet } from "./sheet";

export const APP_VERSION = appConfig.expo.version;
const PREFS_KEY = "budpilot.updates";
const DAY_MS = 24 * 60 * 60 * 1000;
type Prefs = { auto: boolean; lastCheck: number };

type State = {
  check: "idle" | "checking" | "latest" | "available" | "error";
  update?: Update;
  open: boolean; // the sheet
  stage: "idle" | "downloading" | "confirming" | "failed";
  progress: number; // 0..1 while downloading
  problem?: string;
  prefs: Prefs;
};

// one store for the Updates card (in App settings) and the sheet (over everything)
let state: State = { check: "idle", open: false, stage: "idle", progress: 0, prefs: { auto: true, lastCheck: 0, ...loadPref<Partial<Prefs>>(PREFS_KEY) } };
const listeners = new Set<() => void>();
const set = (p: Partial<State>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const useUpdateState = () => useSyncExternalStore(subscribe, () => state);

const savePrefs = (p: Partial<Prefs>) => {
  const prefs = { ...state.prefs, ...p };
  savePref(PREFS_KEY, prefs);
  set({ prefs });
};

/** Asks GitHub; a new version opens the sheet. Nothing found stays quiet in the daily check (the card says it). */
async function check() {
  if (state.check === "checking" || state.stage === "downloading" || state.stage === "confirming") return;
  set({ check: "checking" });
  const r = await checkForUpdate(APP_VERSION);
  if (r.status !== "error") savePrefs({ lastCheck: Date.now() });
  if (r.status === "available") {
    const { status, ...update } = r;
    set({ check: status, update, open: true, stage: "idle", problem: undefined });
  } else set({ check: r.status, update: undefined });
}

/** Download, check, then Android's install prompt; on success Android replaces Shono (which closes it). */
async function install() {
  const u = state.update;
  if (!u) return;
  if (!canInstallUpdates()) return void Linking.openURL(u.apkUrl).catch(() => {});
  set({ stage: "downloading", progress: 0, problem: undefined });
  const progress = onUpdateProgress(({ received, total }) => set({ progress: total > 0 ? received / total : 0 }));
  try {
    const path = await downloadUpdate(u.apkUrl, u.apkName, u.apkSha256, u.apkSize);
    const status = onUpdateStatus(({ status: s, message }) => {
      if (s === "confirm") return set({ stage: "confirming" });
      status.remove();
      if (s === "cancelled") set({ stage: "idle", problem: "The install was cancelled. Tap Download and install to try again." });
      else if (s === "failed") set({ stage: "failed", problem: message ?? "Android couldn't install the update." });
    });
    await installUpdate(path);
  } catch (e) {
    const cancelled = (e as { code?: string }).code === "ERR_CANCELLED";
    set(cancelled ? { stage: "idle", problem: undefined } : { stage: "failed", problem: e instanceof Error ? e.message : String(e) });
  } finally {
    progress.remove();
  }
}

/** Once a day, when Shono opens or comes back to the front: a quiet check. `on`: not during the first run or the tour.
 * A few seconds after opening, so a new version's sheet doesn't land on the loading screen. "Later" closes it until
 * the next day's check. */
export function useDailyUpdateCheck(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const due = () => {
      clearTimeout(wait);
      wait = setTimeout(() => {
        if (state.prefs.auto && Date.now() - state.prefs.lastCheck >= DAY_MS) void check();
      }, 3000);
    };
    due();
    const sub = AppState.addEventListener("change", (s) => (s === "active" ? due() : clearTimeout(wait)));
    return () => {
      clearTimeout(wait);
      sub.remove();
    };
  }, [on]);
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });

/** App settings › Updates: this version, Check for updates, and the daily check's switch. */
export function UpdatesCard() {
  const c = useColors();
  const u = useUpdateState();
  const line =
    u.check === "checking"
      ? "Checking GitHub…"
      : u.check === "available" && u.update
        ? `Shono ${shortVersion(u.update.version)} is ready. You have ${shortVersion(APP_VERSION)}.`
        : u.check === "latest"
          ? `You have the latest version, ${shortVersion(APP_VERSION)}.`
          : u.check === "error"
            ? "Couldn't reach GitHub. Check your connection, then try again."
            : `You have Shono ${shortVersion(APP_VERSION)}.`;
  return (
    <Card>
      <CardHead title="Updates" />
      <Txt v="sub" style={u.check === "error" && { color: c.danger }}>
        {line}
      </Txt>
      {u.check === "available" ? (
        <Button label="See what's new" kind="pri" onPress={() => set({ open: true })} />
      ) : (
        <Button label={u.check === "checking" ? "Checking…" : "Check for updates"} kind="out" onPress={() => void check()} />
      )}
      <ToggleRow title="Check by itself" detail="Once a day, when you open Shono. It only asks GitHub; nothing about you is sent." value={u.prefs.auto} onChange={(auto) => savePrefs({ auto })} />
    </Card>
  );
}

/** The new version: what's new, its size, and Download and install (with its progress). */
export function UpdateSheet({ tablet }: { tablet: boolean }) {
  const c = useColors();
  const u = useUpdateState();
  const up = u.update;
  const busy = u.stage === "downloading" || u.stage === "confirming";
  const close = () => !busy && set({ open: false }); // a download only stops with Cancel
  const facts = up ? [`You have ${shortVersion(APP_VERSION)}`, up.apkSize ? mb(up.apkSize) : "", up.publishedAt ? `out ${day(up.publishedAt)}` : ""].filter(Boolean).join(" · ") : "";
  const primary =
    u.stage === "downloading"
      ? `Downloading… ${Math.round(u.progress * 100)}%`
      : u.stage === "confirming"
        ? "Tap Install in Android's prompt"
        : u.stage === "failed"
          ? "Try again"
          : canInstallUpdates()
            ? "Download and install"
            : "Download from GitHub";
  return (
    <Sheet open={u.open && !!up} tablet={tablet} title={up ? `Shono ${shortVersion(up.version)} is ready` : "Update"} sub={facts} onClose={close}>
      <ScrollView style={s.notes} contentContainerStyle={s.notesBody}>
        {(up?.notes ?? "").split("\n").map((line, i) =>
          line.startsWith("## ") ? (
            <Txt key={i} v="strong" style={s.head}>
              {line.slice(3)}
            </Txt>
          ) : line ? (
            <Txt key={i} v={line.startsWith("• ") ? "body" : "sub"}>
              {line}
            </Txt>
          ) : null,
        )}
      </ScrollView>
      {u.stage === "downloading" && (
        <View style={[s.track, { backgroundColor: c.well }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(u.progress * 100) }}>
          <View style={[s.fill, { width: `${Math.round(u.progress * 100)}%`, backgroundColor: c.signalFill }]} />
        </View>
      )}
      {u.problem ? <Txt v="sub" style={{ color: u.stage === "failed" ? c.danger : c.ink2 }}>{u.problem}</Txt> : null}
      <View style={s.buttons}>
        <Button label={primary} kind="pri" onPress={() => !busy && void install()} />
        {u.stage === "downloading" ? (
          <Button label="Cancel" kind="out" onPress={() => cancelUpdateDownload()} />
        ) : u.stage === "failed" && up ? (
          <Button label="Open on GitHub" kind="out" onPress={() => void Linking.openURL(up.url).catch(() => {})} />
        ) : (
          <Button label="Later" kind="out" onPress={close} />
        )}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  notes: { maxHeight: 280 },
  notesBody: { gap: 6, paddingBottom: 4 },
  head: { marginTop: 6 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  buttons: { gap: 10, paddingTop: 4 },
});
