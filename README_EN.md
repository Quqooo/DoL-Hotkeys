[简中](README.md) | **English**

# DoL Universal Hotkeys

Rebindable hotkeys for the everyday actions of [Degrees of Lewdity](https://gitgud.io/Vrelnir/degrees-of-lewdity)

- Requires: ModLoader >= 2.1.0
- Compatibility: DoL >= 0.4.2.7 (tested on `0.4.2.7`, `0.5.0.5`, `0.5.12.13`)

---

## Features

- Adds a **Hotkeys** tab to the settings overlay, with rebindable actions: back, forward, characteristics, social, traits and more
- Any key, ordered combinations of up to 8 keys; the key box *is* the capture field and saves as soon as you release
- `Esc` cancels an edit, `Backspace` clears the binding; settings live in `localStorage`
- On the Android client the volume keys can be taken over — volume `+` back, `-` forward by default, invertible
- Ignored while a text field has focus or during `V.tempDisable`

---

## Screenshots

![Hotkeys tab](assets/screenshots/panel-en.png)

---

## Development

```bash
npm install
npm run typecheck
npm run build     # dist/: hotkeys.js, hotkeys-early.js, hotkeys.css, boot.json
npm run pack      # dist/DoL-Hotkeys-<version>.mod.zip
npm run test:e2e  # local HTTP + headless browser + CDP assertions
```
