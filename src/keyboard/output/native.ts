import type { KeyboardAction, OutputAdapter } from "./types";

const isTextField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

const isEditable = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.isContentEditable;

const activeTarget = (): HTMLElement | null => {
  let el: Element | null = document.activeElement;
  while (el instanceof HTMLElement && el.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return isTextField(el) || isEditable(el) ? el : null;
};

const desiredColumn = new WeakMap<HTMLElement, number>();

const fireInput = (el: HTMLElement, inputType: string, data: string | null): void => {
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
};

const insertText = (el: HTMLElement, text: string): void => {
  desiredColumn.delete(el);
  if (isTextField(el)) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.setRangeText(text, start, end, "end");
    fireInput(el, "insertText", text);
  } else if (isEditable(el)) {
    const sel = el.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const doc = el.ownerDocument;
    const node = text === "\n" ? doc.createElement("br") : doc.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    fireInput(el, "insertText", text);
  }
};

const deleteRange = (el: HTMLElement, forward: boolean): void => {
  desiredColumn.delete(el);
  if (isTextField(el)) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) {
      if (forward) {
        if (end >= el.value.length) return;
        el.setRangeText("", start, end + 1, "start");
      } else {
        if (start === 0) return;
        el.setRangeText("", start - 1, end, "start");
      }
    } else {
      el.setRangeText("", start, end, "start");
    }
    fireInput(el, forward ? "deleteContentForward" : "deleteContentBackward", null);
  } else if (isEditable(el)) {
    const sel = el.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      const r = range.cloneRange();
      try {
        if (forward) r.setEnd(range.endContainer, range.endOffset + 1);
        else r.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
      } catch {
        return;
      }
      r.deleteContents();
    } else {
      range.deleteContents();
    }
    fireInput(el, forward ? "deleteContentForward" : "deleteContentBackward", null);
  }
};

type LineInfo = { lineStart: number; lineEnd: number; col: number };

const lineInfo = (value: string, pos: number): LineInfo => {
  const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
  const nextNl = value.indexOf("\n", pos);
  const lineEnd = nextNl === -1 ? value.length : nextNl;
  return { lineStart, lineEnd, col: pos - lineStart };
};

const verticalTarget = (
  el: HTMLInputElement | HTMLTextAreaElement,
  focus: number,
  dir: "up" | "down",
): number => {
  const value = el.value;
  const info = lineInfo(value, focus);
  const col = desiredColumn.get(el) ?? info.col;
  desiredColumn.set(el, col);

  if (dir === "up") {
    if (info.lineStart === 0) return 0;
    const prevLineEnd = info.lineStart - 1;
    const prevLineStart = value.lastIndexOf("\n", prevLineEnd - 1) + 1;
    const prevLen = prevLineEnd - prevLineStart;
    return prevLineStart + Math.min(col, prevLen);
  }
  if (info.lineEnd === value.length) return value.length;
  const nextLineStart = info.lineEnd + 1;
  const nextNl = value.indexOf("\n", nextLineStart);
  const nextLineEnd = nextNl === -1 ? value.length : nextNl;
  const nextLen = nextLineEnd - nextLineStart;
  return nextLineStart + Math.min(col, nextLen);
};

const horizontalTarget = (value: string, from: number, step: 1 | -1, word: boolean): number => {
  const clamp = (n: number): number => Math.max(0, Math.min(value.length, n));
  if (!word) return clamp(from + step);
  const isWord = (ch: string | undefined): boolean => !!ch && /\w/.test(ch);
  let i = from;
  if (step < 0) {
    while (i > 0 && !isWord(value[i - 1])) i--;
    while (i > 0 && isWord(value[i - 1])) i--;
  } else {
    while (i < value.length && !isWord(value[i])) i++;
    while (i < value.length && isWord(value[i])) i++;
  }
  return i;
};

const moveCursor = (
  el: HTMLElement,
  direction: "left" | "right" | "up" | "down",
  select: boolean,
  word: boolean,
): void => {
  if (isTextField(el)) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const anchor = el.selectionDirection === "backward" ? end : start;
    const focus = el.selectionDirection === "backward" ? start : end;
    let nextFocus: number;
    if (direction === "left" || direction === "right") {
      desiredColumn.delete(el);
      nextFocus = horizontalTarget(el.value, focus, direction === "left" ? -1 : 1, word);
    } else {
      nextFocus = verticalTarget(el, focus, direction);
    }
    if (select) {
      const [s, e, dir] =
        nextFocus < anchor
          ? [nextFocus, anchor, "backward" as const]
          : [anchor, nextFocus, "forward" as const];
      el.setSelectionRange(s, e, dir);
    } else {
      el.setSelectionRange(nextFocus, nextFocus);
    }
  } else if (isEditable(el)) {
    const sel = el.ownerDocument.getSelection();
    if (!sel) return;
    const alter = select ? "extend" : "move";
    const unit = word ? "word" : direction === "up" || direction === "down" ? "line" : "character";
    const dir = direction === "left" || direction === "up" ? "backward" : "forward";
    sel.modify(alter, dir, unit);
  }
};

const dispatchKey = (
  el: HTMLElement,
  init: KeyboardEventInit & { key: string },
): void => {
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, ...init }));
};

export const nativeAdapter = (): OutputAdapter => ({
  execute(action: KeyboardAction) {
    const el = activeTarget();
    if (!el) return;
    switch (action.kind) {
      case "insertText":
        insertText(el, action.text);
        return;
      case "backspace":
        deleteRange(el, false);
        return;
      case "deleteForward":
        deleteRange(el, true);
        return;
      case "moveCursor":
        if (action.direction === "home" || action.direction === "end") {
          desiredColumn.delete(el);
          dispatchKey(el, { key: action.direction === "home" ? "Home" : "End" });
          return;
        }
        if (action.direction === "pageUp" || action.direction === "pageDown") {
          desiredColumn.delete(el);
          dispatchKey(el, { key: action.direction === "pageUp" ? "PageUp" : "PageDown" });
          return;
        }
        moveCursor(el, action.direction, action.select ?? false, action.word ?? false);
        return;
      case "escape":
        dispatchKey(el, { key: "Escape", code: "Escape" });
        return;
      case "tab":
        dispatchKey(el, { key: "Tab", code: "Tab" });
        insertText(el, "\t");
        return;
      case "function":
        dispatchKey(el, { key: `F${action.n}`, code: `F${action.n}` });
        return;
      case "combo":
        dispatchKey(el, {
          key: action.key,
          ctrlKey: action.modifiers.includes("ctrl"),
          altKey: action.modifiers.includes("alt"),
          shiftKey: action.modifiers.includes("shift"),
          metaKey: action.modifiers.includes("meta"),
        });
        return;
      case "raw":
        insertText(el, action.data);
        return;
    }
  },
});
