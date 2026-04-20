import type { Key, Layer } from "./types";

export const row = (chars: string): Key[] =>
  [...chars].map((c) => ({ label: c, action: { kind: "char", value: c } }));

export const bottomRow = (
  leftLabel: string,
  leftTarget: "letters" | "numbers" | "symbols",
  spaceLabel: string,
  returnLabel: string,
): Key[] => [
  { label: leftLabel, action: { kind: "layer", id: leftTarget } },
  { label: "🌐", action: { kind: "globe" } },
  { label: spaceLabel, action: { kind: "space" }, fill: true },
  { label: returnLabel, action: { kind: "return" }, flex: 2 },
];

export const numbersLayer = (spaceLabel: string, returnLabel: string): Layer => ({
  id: "numbers",
  rows: [
    row("1234567890"),
    row("-/:;()€&@\""),
    [
      { label: "#+=", action: { kind: "layer", id: "symbols" } },
      ...row(".,?!'"),
      { label: "⌫", action: { kind: "backspace" } },
    ],
    bottomRow("ABC", "letters", spaceLabel, returnLabel),
  ],
});

export const symbolsLayer = (spaceLabel: string, returnLabel: string): Layer => ({
  id: "symbols",
  rows: [
    row("[]{}#%^*+="),
    row("_\\|~<>$£¥·"),
    [
      { label: "123", action: { kind: "layer", id: "numbers" } },
      ...row(".,?!'"),
      { label: "⌫", action: { kind: "backspace" } },
    ],
    bottomRow("ABC", "letters", spaceLabel, returnLabel),
  ],
});
