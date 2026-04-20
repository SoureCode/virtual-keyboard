export type CursorDirection =
  | "left"
  | "right"
  | "up"
  | "down"
  | "home"
  | "end"
  | "pageUp"
  | "pageDown";

export type Modifier = "ctrl" | "alt" | "shift" | "meta";

export type KeyboardAction =
  | { kind: "insertText"; text: string }
  | { kind: "backspace" }
  | { kind: "deleteForward" }
  | { kind: "moveCursor"; direction: CursorDirection; select?: boolean; word?: boolean }
  | { kind: "raw"; data: string }
  | { kind: "escape" }
  | { kind: "tab" }
  | { kind: "function"; n: number }
  | { kind: "combo"; modifiers: Modifier[]; key: string };

export type OutputAdapter = {
  execute(action: KeyboardAction): void;
};
