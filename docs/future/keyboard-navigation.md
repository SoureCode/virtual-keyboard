# Keyboard-only navigation of the virtual keyboard

**Status:** not planned, tracking
**Touches:** `src/keyboard/virtual-keyboard.ts`, `src/keyboard/virtual-keyboard.scss`

## Why this note exists

The virtual keyboard is a *substitute* for a hardware keyboard on devices that don't have one. All keys are `tabIndex=-1`, so a sighted user with a real keyboard can't walk the widget with Tab/arrows. The current shape labels the root with `role="group"` + `aria-label` so screen readers understand the scope, but they can't operate the keys without a pointer.

Some users still need hardware operation:

- **Switch-control / eye-tracking / sip-and-puff** rigs that emit synthetic pointer or keyboard events.
- **Keyboard-only accessibility audits** where the widget should be demonstrably operable without a pointer.
- **Desktop users on low-dpi touchscreens** who prefer arrow-keys over a trackpad.

## The future feature

Add an opt-in `keyboard-nav` attribute (or a CSS custom property acting as a flag). When set:

- The first key of the main layer gets `tabIndex=0`; all others stay at `-1`.
- Arrow-keys (on the hardware keyboard) move a focus ring through the grid using row/column math derived from the current layer.
- Enter / Space activate the focused on-screen key (runs the same `#handle` path as a pointer tap).
- Esc exits keyboard-nav mode — focus returns to the previous editor.
- Shift, Ctrl, and Alt on the hardware keyboard just pass through to the editor directly; they don't arm the on-screen sticky modifiers.
- The focus ring uses `:focus-visible` so pointer users don't see it.

## Why it's deferred

- The default use case is phones and tablets without a physical keyboard. Keyboard-nav is an edge case.
- Walking a sparse grid with merged wide keys (shift, backspace, space) isn't a trivial layout algorithm; it needs either a 2D adjacency map or per-layout hand-authored next/prev pointers.
- Sticky-modifier interaction with hardware modifier passthrough is easy to get wrong (two state machines overlapping).

## When to revisit

- A user with an accessibility need reports it.
- We want to run an automated a11y audit (axe, Pa11y) and see keyboard-only operability as a pass criterion.
- Someone contributes the 2D grid navigator, at which point the policy questions above need resolving.

## Guardrails

- Keep it opt-in. Default shipping behavior stays pointer-only.
- If the keyboard is operated via hardware, the real editor must stay focused — otherwise the user can't actually type *through* the virtual keyboard.
- Document the focus ordering in SCSS so the ring is obvious where it is.
