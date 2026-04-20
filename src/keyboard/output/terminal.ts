import type { CursorDirection, KeyboardAction, Modifier, OutputAdapter } from "./types";

export type TerminalSend = (data: string) => void;

export type TerminalAdapterOptions = {
  returnSequence?: string;
  backspaceSequence?: string;
  deleteForwardSequence?: string;
  cursorSequences?: Partial<Record<CursorDirection, string>>;
};

const ARROW: Record<"up" | "down" | "left" | "right", string> = {
  up: "A",
  down: "B",
  right: "C",
  left: "D",
};

const DEFAULT_CURSOR: Record<CursorDirection, string> = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  home: "\x1b[H",
  end: "\x1b[F",
  pageUp: "\x1b[5~",
  pageDown: "\x1b[6~",
};

const modifiedCursor = (direction: CursorDirection, word: boolean, select: boolean): string | null => {
  if (!word && !select) return null;
  const code = 1 + (select ? 1 : 0) + (word ? 4 : 0);
  if (direction === "home") return `\x1b[1;${code}H`;
  if (direction === "end") return `\x1b[1;${code}F`;
  if (direction === "pageUp") return `\x1b[5;${code}~`;
  if (direction === "pageDown") return `\x1b[6;${code}~`;
  return `\x1b[1;${code}${ARROW[direction]}`;
};

const FUNCTION_KEYS: Record<number, string> = {
  1: "\x1bOP",
  2: "\x1bOQ",
  3: "\x1bOR",
  4: "\x1bOS",
  5: "\x1b[15~",
  6: "\x1b[17~",
  7: "\x1b[18~",
  8: "\x1b[19~",
  9: "\x1b[20~",
  10: "\x1b[21~",
  11: "\x1b[23~",
  12: "\x1b[24~",
};

const ctrlSequence = (key: string): string | null => {
  if (key.length !== 1) return null;
  const c = key.toLowerCase().charCodeAt(0);
  if (c >= 97 && c <= 122) return String.fromCharCode(c - 96); // a-z → 0x01-0x1a
  if (key === "[") return "\x1b";
  if (key === "\\") return "\x1c";
  if (key === "]") return "\x1d";
  if (key === " ") return "\x00";
  return null;
};

const combo = (modifiers: Modifier[], key: string): string => {
  const hasCtrl = modifiers.includes("ctrl");
  const hasAlt = modifiers.includes("alt");
  let base = key;
  if (hasCtrl) base = ctrlSequence(key) ?? key;
  if (hasAlt) base = `\x1b${base}`;
  return base;
};

export const terminalAdapter = (
  send: TerminalSend,
  options: TerminalAdapterOptions = {},
): OutputAdapter => {
  const returnSeq = options.returnSequence ?? "\r";
  const backspaceSeq = options.backspaceSequence ?? "\x7f";
  const deleteSeq = options.deleteForwardSequence ?? "\x1b[3~";
  const cursor = { ...DEFAULT_CURSOR, ...options.cursorSequences };
  return {
    execute(action: KeyboardAction) {
      switch (action.kind) {
        case "insertText":
          send(action.text === "\n" ? returnSeq : action.text);
          return;
        case "backspace":
          send(backspaceSeq);
          return;
        case "deleteForward":
          send(deleteSeq);
          return;
        case "moveCursor": {
          const seq = modifiedCursor(action.direction, !!action.word, !!action.select);
          send(seq ?? cursor[action.direction]);
          return;
        }
        case "escape":
          send("\x1b");
          return;
        case "tab":
          send("\t");
          return;
        case "function":
          send(FUNCTION_KEYS[action.n] ?? "");
          return;
        case "combo":
          send(combo(action.modifiers, action.key));
          return;
        case "raw":
          send(action.data);
          return;
      }
    },
  };
};
