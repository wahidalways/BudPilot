import { useView } from "@/hooks/use-desktop";

import { Flyout } from "./flyout";
import { Settings } from "./settings";
import { useBudPilot } from "./use-bud-pilot";

/** One window, two views: the tray flyout for everyday changes, the settings window for the rest. */
export function Home() {
  const b = useBudPilot();
  return useView() === "flyout" ? <Flyout b={b} /> : <Settings b={b} />;
}
