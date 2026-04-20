import type { KeyboardAction, OutputAdapter } from "./types";

const isTextField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

const isEditable = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.isContentEditable;

const activeTarget = (): HTMLElement | null => {
  const el = document.activeElement;
  return isTextField(el) || isEditable(el) ? el : null;
};

const fireInput = (el: HTMLElement, inputType: string, data: string | null): void => {
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
};

const insertText = (el: HTMLElement, text: string): void => {
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
    const node = text === "\n" ? document.createElement("br") : document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    fireInput(el, "insertText", text);
  }
};

const deleteRange = (el: HTMLElement, forward: boolean): void => {
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

const moveCursor = (
  el: HTMLElement,
  direction: "left" | "right" | "up" | "down",
  select: boolean,
  word: boolean,
): void => {
  if (isTextField(el)) {
    const len = el.value.length;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const anchor = el.selectionDirection === "backward" ? end : start;
    const focus = el.selectionDirection === "backward" ? start : end;
    let nextFocus = focus;
    if (direction === "left") nextFocus = wordBoundary(el.value, focus, -1, word);
    else if (direction === "right") nextFocus = wordBoundary(el.value, focus, 1, word);
    else if (direction === "up") nextFocus = 0;
    else nextFocus = len;
    if (select) {
      const [s, e, dir] =
        nextFocus < anchor ? [nextFocus, anchor, "backward" as const] : [anchor, nextFocus, "forward" as const];
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

const wordBoundary = (value: string, from: number, step: 1 | -1, word: boolean): number => {
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
        moveCursor(el, action.direction, action.select ?? false, action.word ?? false);
        return;
      case "raw":
        insertText(el, action.data);
        return;
    }
  },
});
