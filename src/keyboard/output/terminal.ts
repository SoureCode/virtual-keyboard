import type { CursorDirection, KeyboardAction, OutputAdapter } from "./types";

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
          send(cursor[action.direction]);
          return;
        case "raw":
          send(action.data);
          return;
      }
    },
  };
};
