# BudPilot

Control your Bluetooth earbuds from your phone and your PC: noise control, EQ and battery, without the maker's app.

> A personal project. Not made, approved or supported by Hoco, JieLi or any other earbud or chip maker.

## Status

Version 0.2.0, Windows first.

- [x] Bluetooth handshake with JieLi-based earbuds, tested on a real HOCO EQ35 ANC
- [x] Battery for each earbud and the case
- [x] Noise control: off, noise cancelling (Low, Mid, High or Adaptive), transparency
- [x] **Keeps your noise setting**: the earbuds switch to ANC by themselves every time they power up; BudPilot stops that
- [x] EQ: Hoco's presets, plus a custom EQ with 10 sliders
- [x] Touch controls for each earbud
- [x] Wear detection and game mode switches
- [x] Windows app: connects by itself, lives in the tray, can start with Windows
- [ ] Android app

### Keeping your noise setting

The earbuds' firmware turns ANC on by itself about a second after they power up, and again when they're put in or taken out. They can't be told to remember a mode. So BudPilot remembers it: the moment it connects, it limits the earbuds to the one mode you chose, so the firmware has nothing else to switch to, and it switches back within a fraction of a second if anything still slips through. This works while BudPilot is running, which is why it stays in the tray and can start with Windows.

Adaptive noise cancelling is BudPilot's own too: the earbuds have no adaptive mode, so BudPilot picks Low, Mid or High from how loud the room is, using a microphone on the computer (never the earbuds'). Only the loudness is used; nothing is recorded.

## Supported earbuds

| Earbuds | Status |
| --- | --- |
| HOCO EQ35 ANC | Works on Windows |

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

Closing the window keeps BudPilot running in the tray (it needs to, to keep your noise setting). Use the tray icon to open it, turn **Start with Windows** on or off, or quit.

### Android app

Not started yet. Bluetooth will need a development build; it does not work in Expo Go.

`tools/probe/` is a Python test bench for trying commands from a Windows PC: `pip install bleak`, then `python tools/probe/probe.py`. Disconnect any other app that is connected to the earbuds over Bluetooth LE first.

## License

Free to use and to share. To change it, publish a changed copy or sell it, ask wahidalways first. See [LICENSE](LICENSE).
