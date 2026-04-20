import type { Modifier } from "./output";

export type TopbarAction =
  | { kind: "escape" }
  | { kind: "tab" }
  | { kind: "function"; n: number }
  | { kind: "cursor"; direction: "left" | "right" | "up" | "down" | "home" | "end" | "pageUp" | "pageDown" }
  | { kind: "insert" }
  | { kind: "deleteForward" }
  | { kind: "modifier"; modifier: Modifier };

export type TopbarKey = {
  label: string;
  action: TopbarAction;
  wide?: boolean;
};

export type TopbarGroup = TopbarKey[];
export type TopbarRow = TopbarGroup[];

const fnKey = (n: number): TopbarKey => ({
  label: `F${n}`,
  action: { kind: "function", n },
});

export const topbarRows: TopbarRow[] = [
  [
    [{ label: "Esc", action: { kind: "escape" }, wide: true }],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(fnKey),
    [
      { label: "Ins", action: { kind: "insert" } },
      { label: "Del", action: { kind: "deleteForward" } },
      { label: "Home", action: { kind: "cursor", direction: "home" } },
      { label: "End", action: { kind: "cursor", direction: "end" } },
      { label: "PgUp", action: { kind: "cursor", direction: "pageUp" } },
      { label: "PgDn", action: { kind: "cursor", direction: "pageDown" } },
    ],
  ],
  [
    [{ label: "Tab", action: { kind: "tab" }, wide: true }],
    [
      { label: "Ctrl", action: { kind: "modifier", modifier: "ctrl" }, wide: true },
      { label: "Alt", action: { kind: "modifier", modifier: "alt" }, wide: true },
      { label: "Super", action: { kind: "modifier", modifier: "meta" }, wide: true },
    ],
    [
      { label: "←", action: { kind: "cursor", direction: "left" } },
      { label: "↑", action: { kind: "cursor", direction: "up" } },
      { label: "↓", action: { kind: "cursor", direction: "down" } },
      { label: "→", action: { kind: "cursor", direction: "right" } },
    ],
  ],
];
