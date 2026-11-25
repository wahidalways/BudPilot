// Shono has no GIFs: leaves out React Native's GIF decoder (libgifimage.so, ~0.3 MB of the APK). WebP stays on, for
// the earbuds' photos.
const { withGradleProperties } = require("expo/config-plugins");

module.exports = (config) =>
  withGradleProperties(config, (c) => {
    c.modResults = c.modResults.filter((p) => !(p.type === "property" && p.key === "expo.gif.enabled"));
    c.modResults.push({ type: "property", key: "expo.gif.enabled", value: "false" });
    return c;
  });
