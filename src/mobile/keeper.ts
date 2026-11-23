import { useEffect } from "react";
import { PermissionsAndroid, Platform } from "react-native";

import { usingSample } from "@/ble/connect";
import { keepChipParts } from "@/screens/home/parts";
import type { BudPilot } from "@/screens/home/use-bud-pilot";
import { seconds, today } from "@/utils/corrections";
import { loadPref, savePref } from "@/utils/prefs";

import { keeperAvailable, onStopPressed, startKeeper, stopKeeper } from "../../modules/shono-keeper";
import { useLastSeenOn } from "./find";

const ASKED_KEY = "budpilot.askedNotifications";

/** Android 13+ shows the ongoing notification only with permission: asked once, the first time it's needed. Shono
 * keeps working in the background without it; the notification just doesn't show. */
async function askNotificationsOnce() {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33 || loadPref<boolean>(ASKED_KEY)) return;
  savePref(ASKED_KEY, true);
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
}

/** What the ongoing notification says: what Shono is keeping, and today's put-backs. */
export function keeperText(b: BudPilot, lastSeen = false) {
  const live = b.status === "connected" && !!b.state;
  const keeping = keepChipParts(b)?.text.join("");
  const { count, fastestMs } = today(b.corrections);
  return {
    title: live ? (keeping ?? "Connected to your earbuds") : "Waiting for your earbuds",
    text: !live
      ? "Shono connects by itself when they're out of the case"
      : !b.keep && lastSeen
        ? "Noting where you last used them (Last seen)"
        : count && fastestMs !== undefined
        ? `Put back ${count} time${count === 1 ? "" : "s"} today · fastest ${seconds(fastestMs)}`
        : "Shono puts it back if your earbuds switch by themselves",
  };
}

/** Keeps Shono connected in the background while it's keeping a noise setting or Last seen is on: an ongoing
 * notification, started once the earbuds are found, kept while Shono waits for them to come back, and gone after
 * Disconnect or its Stop button. */
export function useKeeper(b: BudPilot, onboarded: boolean) {
  const lastSeen = useLastSeenOn();
  const games = b.game.prefs.auto && b.game.usage; // Turn on with games: acts while the game is in front
  const on = keeperAvailable() && !usingSample() && onboarded && (b.keep || lastSeen || games) && b.status !== "idle";
  const { title, text } = keeperText(b, lastSeen);
  const { disconnect } = b;

  // started while Shono is in front (connecting after the first run, or opened later); after that only its
  // notification is updated, also while Shono waits in the background for the earbuds to come back
  useEffect(() => {
    if (!on) return;
    let gone = false;
    void askNotificationsOnce().then(() => {
      if (!gone) startKeeper(title, text);
    });
    return () => {
      gone = true;
    };
  }, [on, title, text]);
  useEffect(() => {
    if (!on) stopKeeper();
  }, [on]);
  useEffect(() => {
    const sub = onStopPressed(() => void disconnect());
    return () => sub.remove();
  }, [disconnect]);
  return on;
}
