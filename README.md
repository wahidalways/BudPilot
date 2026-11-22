# BudPilot

Control your Bluetooth earbuds from your phone and your PC: noise control, EQ and battery, without the maker's app.

> A personal project. Not made, approved or supported by Hoco, JieLi or any other earbud or chip maker.

## Status

Early work (0.1.0), Windows first.

- [x] Bluetooth handshake with JieLi-based earbuds, tested on a real HOCO EQ35 ANC
- [x] Battery for each earbud and the case
- [x] Noise control: off, noise cancelling, transparency
- [x] EQ presets
- [x] Game mode
- [x] Windows app
- [ ] Custom EQ (band sliders)
- [ ] Touch controls
- [ ] Android app

## Supported earbuds

| Earbuds | Status |
| --- | --- |
| HOCO EQ35 ANC | In progress |

Many budget earbuds use JieLi chips and the same control protocol, so more models can follow. To ask for yours, open an issue with the model name and a screenshot of its Bluetooth services in nRF Connect.

## How it works

JieLi-based earbuds offer a Bluetooth LE service `AE00`. The app writes commands to `AE01` and gets replies on `AE02`. First, both sides prove who they are with the Bluetooth legacy E1 function and a key that is fixed in the firmware ([src/jieli/auth.ts](src/jieli/auth.ts)). Quarkslab first described this handshake in [A modern tale of blinkenlights](https://blog.quarkslab.com/modern-tale-blinkenlights.html).

## Develop

Built with Expo SDK 58 and TypeScript.

```bash
npm install
npm --prefix desktop install
npm test          # protocol tests
```

### Windows app

The Windows app is the Expo web build inside an Electron window ([desktop/](desktop/)). It reaches the earbuds through Web Bluetooth.

- Try changes live: run `npx expo start --web` in one terminal and `npm run desktop:dev` in another.
- Build the app: `npm run desktop:build` writes `desktop/release/BudPilot-<version>.exe`, a portable app with no installer. The version comes from the root `package.json`.

The exe isn't code-signed, so Windows SmartScreen may warn on first start: choose **More info**, then **Run anyway**.

### Android app

Not started yet. Bluetooth will need a development build; it does not work in Expo Go.

`tools/probe/` is a Python test bench for trying commands from a Windows PC: `pip install bleak`, then `python tools/probe/probe.py`. Disconnect any other app that is connected to the earbuds over Bluetooth LE first.

## License

Free to use and to share. To change it, publish a changed copy or sell it, ask wahidalways first. See [LICENSE](LICENSE).
