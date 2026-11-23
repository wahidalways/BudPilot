// Shono has one screen, so no router: expo-router was 465 KB of the Windows app's 2 MB of JavaScript.
import { registerRootComponent } from "expo";

import App from "@/app";

registerRootComponent(App);
