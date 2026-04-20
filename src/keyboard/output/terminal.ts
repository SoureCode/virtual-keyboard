import type { CursorDirection, KeyboardAction, Modifier, OutputAdapter } from "./types";

export type TerminalSend = (data: string) => void;

export type TerminalAdapterOptions = {
  returnSequence?: string;
  backspaceSequence?: string;
  deleteForwardSequence?: string;
  cursorSequences?: Partial<Record<CursorDirection, string>>;
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

const WORD_CURSOR: Partial<Record<CursorDirection, string>> = {
  up: "\x1b[1;5A",
  down: "\x1b[1;5B",
  right: "\x1b[1;5C",
  left: "\x1b[1;5D",
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
        case "moveCursor":
          if (action.word && WORD_CURSOR[action.direction]) {
            send(WORD_CURSOR[action.direction]!);
          } else {
            send(cursor[action.direction]);
          }
          return;
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
