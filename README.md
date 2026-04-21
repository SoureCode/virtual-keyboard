# virtual-keyboard

A framework-agnostic on-screen keyboard as a web component. Drops into any page with `<virtual-keyboard></virtual-keyboard>` and types into the currently focused text field or into a terminal (xterm.js, pty, WebSocket — your choice) through an output adapter.

**Live demo**: https://sourecode.github.io/virtual-keyboard/

## Install (without npmjs)

This package is not published to the npm registry. Install it from GitHub:

```sh
npm install github:SoureCode/virtual-keyboard#v0.1.3
```

The `prepare` script builds the library on install. Consumers need `git` plus either public-repo access or a PAT/SSH key with read access.

Prefer a prebuilt tarball (no build toolchain on the consumer side)? Each tagged release attaches one as a GitHub Release asset:

```sh
npm install https://github.com/SoureCode/virtual-keyboard/releases/download/v0.1.3/sourecode-virtual-keyboard-0.1.3.tgz
```

Then import:

```ts
import { VirtualKeyboard, terminalAdapter, nativeAdapter } from "@sourecode/virtual-keyboard";
```

The element bundles its own styles and adopts them into its shadow root on connect — no separate stylesheet import needed.

## Features

- Custom element `<virtual-keyboard>`, all styles scoped in Shadow DOM — zero global footprint
- Multi-locale layouts: **en** (QWERTY) and **de** (QWERTZ), switchable via the globe key or the `locale` attribute
- Three layers per layout: letters, numbers, symbols
- Shift states: **off**, **one-shot**, **locked** (double-tap to lock)
- Long-press alternates popover (accents, fractions, quotes, currencies) — viewport-clamped so it never clips
- Scrollable two-row topbar with `Esc`, `F1`–`F12`, `Ins` / `Del`, `Home` / `End` / `PgUp` / `PgDn`, `Tab`, `Ctrl` / `Alt`, and arrow keys. Touch inertia + mouse drag + wheel scroll, no scrollbar
- Sticky modifiers — `Ctrl` / `Alt` arm for one-shot; double-tap to lock. `Ctrl+Arrow` / `Alt+Arrow` jumps by word and doesn't auto-repeat
- Text selection via `Shift+Arrow`, `Shift+Ctrl+Arrow` (word), and `Shift+Home/End/PgUp/PgDn` — shift stays active across presses so selection keeps extending
- Hold-to-repeat for character keys, space, backspace, and arrow-cluster keys (≈33 keys/sec after a 300 ms delay, tunable via `repeat-initial-ms` / `repeat-interval-ms`)
- Arrow keys preserve the desired text column across up/down (native-editor behaviour)
- Click-through focus: tapping any key never moves focus away from the editor
- Output adapters:
  - **native** — writes into focused `<input>`, `<textarea>`, or `contenteditable`; dispatches proper `InputEvent` / `KeyboardEvent`
  - **terminal** — emits VT/ANSI sequences (`\r`, `\x7f`, `\x1b[A`, `\x1b[1;5D` word, `\x1b[1;2D` select, `\x1b[1;6D` word-select, `F1`–`F12`, etc.) via a user-supplied `send(data)` callback; wire it to `term.paste()`, `term.onData`, or any pty/WS

## Usage

```html
<script type="module" src="/path/to/virtual-keyboard.js"></script>

<textarea autofocus></textarea>
<virtual-keyboard locale="en"></virtual-keyboard>
```

### Switching the output target

```ts
import { VirtualKeyboard, terminalAdapter } from "@sourecode/virtual-keyboard";

const kb = document.querySelector("virtual-keyboard")!;
kb.setAdapter(terminalAdapter((data) => term.paste(data)));
```

### Events

```ts
kb.addEventListener("vk-input", (e) => console.log(e.detail.text));
kb.addEventListener("vk-backspace", () => console.log("⌫"));
kb.addEventListener("vk-locale", (e) => console.log(e.detail.locale));
```

## Development

```sh
nvm use          # uses .nvmrc (Node 24.15.0)
npm install
npm run dev      # starts Vite on :5173
npm run build    # typecheck + production build into ./dist
```

The dev server auto-detects `VSCODE_PROXY_URI` (code-server / Coder workspaces) and rewrites its base + HMR URL so the app loads through the reverse proxy without extra config.

## Layout anatomy

```
src/keyboard/
├── layouts/
│   ├── en.ts          QWERTY, return / space labels
│   ├── de.ts          QWERTZ, Return / Leerzeichen, ü ö ä in letter rows
│   ├── shared.ts      row() helper, numbers and symbols layer builders
│   ├── alternates.ts  long-press accent / fraction / quote map
│   └── types.ts       Key / Layer / Layout type definitions
├── output/
│   ├── native.ts      focused-element adapter (word/line movement, column memory)
│   ├── terminal.ts    VT/ANSI sequence adapter
│   └── types.ts       OutputAdapter + KeyboardAction union
├── topbar.ts          Esc / F-keys / nav / arrows row config
├── virtual-keyboard.ts    custom element + event wiring
└── virtual-keyboard.scss  scoped styles (dark default, light via prefers-color-scheme)
```

## License

MIT
