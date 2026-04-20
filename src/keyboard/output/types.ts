export type CursorDirection = "left" | "right" | "up" | "down";

export type KeyboardAction =
  | { kind: "insertText"; text: string }
  | { kind: "backspace" }
  | { kind: "deleteForward" }
  | { kind: "moveCursor"; direction: CursorDirection; select?: boolean; word?: boolean }
  | { kind: "raw"; data: string };

export type OutputAdapter = {
  execute(action: KeyboardAction): void;
};
