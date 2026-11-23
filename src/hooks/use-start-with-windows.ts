import { useCallback, useEffect, useState } from "react";

import { desktop } from "./use-desktop";

/** "Start with Windows". `available`: running in the Windows app. `on`: null in the live test window
 * (only the installed app can start with Windows), undefined while loading. */
export function useStartWithWindows() {
  const [on, setOn] = useState<boolean | null>();

  useEffect(() => {
    const d = desktop();
    if (!d) return;
    void d.getStartWithWindows().then(setOn);
    // the tray menu can change it too
    (globalThis as { __budpilotStartWithWindows?: (v: boolean) => void }).__budpilotStartWithWindows = setOn;
  }, []);

  const set = useCallback(async (v: boolean) => {
    const d = desktop();
    if (d) setOn(await d.setStartWithWindows(v));
  }, []);

  return { available: !!desktop(), on, set };
}
