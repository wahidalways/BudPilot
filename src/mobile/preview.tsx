// Development only: the phone and tablet screens in a browser (open the dev server with ?phone), on sample earbuds,
// so they can be looked at without a phone. Production builds leave it out (see app.tsx).
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MobileApp } from "./shell";
import { KeepTopClear } from "./top-clear";

(globalThis as { __shonoSample?: boolean }).__shonoSample = true;

export default function PhonePreview() {
  return (
    <SafeAreaProvider>
      <KeepTopClear>
        <MobileApp />
      </KeepTopClear>
    </SafeAreaProvider>
  );
}
