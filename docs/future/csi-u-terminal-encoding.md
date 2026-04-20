# CSI-u terminal encoding mode

**Status:** not planned, tracking
**Touches:** `src/keyboard/output/terminal.ts`

## Why this note exists

Two behaviors in the terminal output adapter look like bugs but are actually the canonical VT100 behavior every classic terminal has shipped for fifty years. Changing them unconditionally would break existing user bindings against `bash`, `tmux`, `vim`, `less`, etc. This note captures the limitation so a future contributor knows what the trade-off is.

## The two limitations

1. **`Ctrl+Space` sends `\x00` (NUL).**
   Source: `ctrlSequence(" ")` in `terminal.ts`.
   NUL is the VT mapping for Ctrl+Space. Emacs uses it for `set-mark`; most other TUIs ignore it. We keep it because users expecting `set-mark` would otherwise silently lose the key.

2. **`Ctrl+Shift+<letter>` produces the same byte as `Ctrl+<letter>`.**
   Source: `combo()` in `terminal.ts`.
   Classic VT encoding of Ctrl-modified keys is a single byte `0x01–0x1a`; there is no bit for Shift. Terminals that want to distinguish Ctrl vs Ctrl+Shift require an out-of-band extension.

## The future feature

Add an opt-in encoding mode to `terminalAdapter`:

```ts
terminalAdapter(send, { encoding: "csi-u" })
```

- Default stays `"vt"` (current behavior).
- `"csi-u"` emits [CSI-u](https://www.leonerd.org.uk/hacks/fixterms/) / [kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) sequences, e.g.:
  - `Ctrl+Shift+L` → `\x1b[76;6u` (codepoint 76 = "L", modifier bits 6 = Ctrl+Shift)
  - `Ctrl+Space` → `\x1b[32;5u` (codepoint 32 = space, modifier bits 5 = Ctrl)
- The guest must advertise support (kitty, wezterm, foot, alacritty ≥ 0.15, xterm ≥ 390 with `allowKittyKeyboard`). Terminals that don't understand the sequence will display the raw escape.

## Guardrails

- Never enable by default. Classic VT is the lowest common denominator and what xterm.js + busybox expect.
- Expose the setting on the adapter factory only, not on the keyboard component, so pages that mix input sources can choose independently.
- Test matrix should include at least one CSI-u-aware and one non-aware target (e.g. v86 busybox vs. a modern local kitty).

## When to revisit

- A user reports that Ctrl+Shift bindings don't fire against a kitty/wezterm target.
- We ship a second `linux.ts`-style example that targets a terminal known to support CSI-u.
