import styleText from "./virtual-keyboard.scss?inline";
import {
  isLocale,
  layouts,
  locales,
  type Key,
  type LayerId,
  type Locale,
} from "./layouts";
import { nativeAdapter, type Modifier, type OutputAdapter } from "./output";
import { topbarRows, type TopbarKey } from "./topbar";

type ShiftState = "off" | "on" | "locked";

type ModifierState = "armed" | "locked";

type State = {
  locale: Locale;
  layer: LayerId;
  shift: ShiftState;
  modifiers: Map<Modifier, ModifierState>;
};

type Press = {
  key: Key;
  button: HTMLButtonElement;
  pointerId: number;
  timer: number | null;
  popover: HTMLElement | null;
  alts: HTMLButtonElement[];
  selectedIndex: number;
  committed: boolean;
  committedChar: string | null;
  upperAtDown: boolean;
  controller: AbortController;
};

type Repeat = {
  key: Key;
  pointerId: number;
  initial: number | null;
  interval: number | null;
};

const DEFAULT_LOCALE: Locale = "en";
const DEFAULT_DOUBLE_TAP_MS = 300;
const DEFAULT_LONG_PRESS_MS = 350;
const DEFAULT_REPEAT_INITIAL_MS = 300;
const DEFAULT_REPEAT_INTERVAL_MS = 30;

/** Hold-to-repeat binder.
 *  `fire` runs once on pointerdown, then every `intervalMs` after `initialMs`
 *  until pointerup/cancel, the signal aborts, or `fire` returns `false`.
 *  `true` or `void` means "keep repeating". */
const attachRepeat = (
  btn: HTMLElement,
  fire: () => boolean | void,
  signal: AbortSignal,
  initialMs: number,
  intervalMs: number,
): void => {
  let initial: number | null = null;
  let interval: number | null = null;
  const stop = (): void => {
    if (initial !== null) clearTimeout(initial);
    if (interval !== null) clearInterval(interval);
    initial = null;
    interval = null;
  };
  const run = (): void => {
    if (signal.aborted || fire() === false) stop();
  };
  btn.addEventListener("pointerdown", () => {
    stop();
    if (fire() === false) return;
    initial = window.setTimeout(() => {
      initial = null;
      interval = window.setInterval(run, intervalMs);
    }, initialMs);
  }, { signal });
  btn.addEventListener("pointerup", stop, { signal });
  btn.addEventListener("pointercancel", stop, { signal });
  btn.addEventListener("pointerleave", stop, { signal });
  signal.addEventListener("abort", stop, { once: true });
};

const isRepeatableKey = (key: Key): boolean => {
  const k = key.action.kind;
  return k === "char" || k === "space" || k === "return" || k === "backspace";
};

const isRepeatableTopbar = (action: TopbarKey["action"]): boolean => {
  return action.kind === "cursor" || action.kind === "tab" || action.kind === "deleteForward";
};

const stylesheet = new CSSStyleSheet();
stylesheet.replaceSync(styleText);

export class VirtualKeyboard extends HTMLElement {
  static observedAttributes = [
    "locale",
    "double-tap-ms",
    "long-press-ms",
    "repeat-initial-ms",
    "repeat-interval-ms",
  ];

  #state: State = {
    locale: DEFAULT_LOCALE,
    layer: "letters",
    shift: "off",
    modifiers: new Map(),
  };
  #lastModifierTap = new Map<Modifier, number>();
  #root: ShadowRoot;
  #lastShiftTap = 0;
  #adapter: OutputAdapter = nativeAdapter();
  #press: Press | null = null;
  #controller: AbortController | null = null;
  #doubleTapMs = DEFAULT_DOUBLE_TAP_MS;
  #longPressMs = DEFAULT_LONG_PRESS_MS;
  #repeatInitialMs = DEFAULT_REPEAT_INITIAL_MS;
  #repeatIntervalMs = DEFAULT_REPEAT_INTERVAL_MS;
  #keyForButton = new WeakMap<HTMLElement, Key>();
  #repeat: Repeat | null = null;
  #simplePreview: { popover: HTMLElement; pointerId: number } | null = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get locale(): Locale {
    return this.#state.locale;
  }

  set locale(value: Locale) {
    this.setAttribute("locale", value);
  }

  setAdapter(adapter: OutputAdapter): void {
    this.#adapter = adapter;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "locale") {
      const next = value && isLocale(value) ? value : DEFAULT_LOCALE;
      if (next === this.#state.locale) return;
      this.#state.locale = next;
      this.#state.layer = "letters";
      this.#state.shift = "off";
      if (this.isConnected) this.#render();
      return;
    }
    const parsed = value === null ? NaN : Number(value);
    const ms = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    switch (name) {
      case "double-tap-ms":
        this.#doubleTapMs = ms ?? DEFAULT_DOUBLE_TAP_MS;
        return;
      case "long-press-ms":
        this.#longPressMs = ms ?? DEFAULT_LONG_PRESS_MS;
        return;
      case "repeat-initial-ms":
        this.#repeatInitialMs = ms ?? DEFAULT_REPEAT_INITIAL_MS;
        return;
      case "repeat-interval-ms":
        this.#repeatIntervalMs = ms ?? DEFAULT_REPEAT_INTERVAL_MS;
        return;
    }
  }

  connectedCallback(): void {
    this.#root.adoptedStyleSheets = [stylesheet];

    const root = document.createElement("div");
    root.className = "vk";
    root.setAttribute("part", "root");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "On-screen keyboard");

    const topbar = document.createElement("div");
    topbar.className = "topbar";
    topbar.setAttribute("part", "topbar");
    topbar.setAttribute("role", "group");
    topbar.setAttribute("aria-label", "Modifiers and special keys");

    const keyboard = document.createElement("div");
    keyboard.className = "keyboard";
    keyboard.setAttribute("part", "keyboard");
    keyboard.setAttribute("role", "group");
    keyboard.setAttribute("aria-label", "Main keyboard");

    root.append(topbar, keyboard);
    this.#root.replaceChildren(root);

    this.#controller = new AbortController();
    const { signal } = this.#controller;
    const swallowFocusUnlessTopbar = (e: Event): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".topbar")) return;
      e.preventDefault();
    };
    const host = this.#root.querySelector(".vk");
    host?.addEventListener("pointerdown", swallowFocusUnlessTopbar, { signal });
    host?.addEventListener("mousedown", swallowFocusUnlessTopbar, { signal });

    const grid = this.#root.querySelector(".keyboard") as HTMLElement | null;
    grid?.addEventListener("pointerdown", (e) => this.#onGridPointerDown(e), { signal });
    grid?.addEventListener("pointerup", (e) => this.#onGridPointerUp(e), { signal });
    grid?.addEventListener("pointercancel", (e) => this.#onGridPointerCancel(e), { signal });

    this.#renderTopbar();
    this.#attachDragScroll(this.#root.querySelector(".topbar") as HTMLElement);
    this.#render();
  }

  disconnectedCallback(): void {
    this.#controller?.abort();
    this.#controller = null;
    this.#cancelPress();
    this.#stopRepeat();
    this.#clearSimplePreview();
  }

  #renderTopbar(): void {
    const topbar = this.#root.querySelector(".topbar");
    if (!topbar) return;
    const track = document.createElement("div");
    track.className = "topbar-track";
    for (const row of topbarRows) {
      const rowEl = document.createElement("div");
      rowEl.className = "topbar-row";
      for (let g = 0; g < row.length; g++) {
        if (g > 0) {
          const sep = document.createElement("span");
          sep.className = "topbar-sep";
          sep.setAttribute("aria-hidden", "true");
          rowEl.append(sep);
        }
        for (const key of row[g]!) rowEl.append(this.#renderTopbarKey(key));
      }
      track.append(rowEl);
    }
    topbar.replaceChildren(track);
  }

  #renderTopbarKey(key: TopbarKey): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.className = "tb-key";
    if (key.wide) btn.classList.add("wide");
    btn.textContent = key.label;
    if (key.action.kind === "modifier") {
      const s = this.#state.modifiers.get(key.action.modifier);
      if (s === "armed") btn.classList.add("active");
      if (s === "locked") btn.classList.add("locked");
    }
    const signal = this.#controller!.signal;
    if (isRepeatableTopbar(key.action)) {
      attachRepeat(btn, (): boolean | void => this.#handleTopbar(key), signal, this.#repeatInitialMs, this.#repeatIntervalMs);
    } else {
      let startX = 0;
      let startY = 0;
      let moved = false;
      btn.addEventListener("pointerdown", (e) => {
        startX = e.clientX;
        startY = e.clientY;
        moved = false;
      }, { signal });
      btn.addEventListener("pointermove", (e) => {
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) moved = true;
      }, { signal });
      btn.addEventListener("pointerup", () => {
        if (!moved) this.#handleTopbar(key);
      }, { signal });
    }
    return btn;
  }

  /** Topbar press/repeat handler.
   *  Returns `false` to stop auto-repeat after this tick (e.g. a word-jump
   *  cursor move or a Tab with modifiers held); `true` keeps repeating. */
  #handleTopbar(key: TopbarKey): boolean {
    const a = key.action;
    switch (a.kind) {
      case "escape":
        this.#adapter.execute({ kind: "escape" });
        return true;
      case "tab": {
        const hadMods = this.#state.modifiers.size > 0;
        this.#emitTab();
        return !hadMods;
      }
      case "function":
        this.#adapter.execute({ kind: "function", n: a.n });
        this.#clearArmedModifiers();
        return true;
      case "cursor": {
        const mods = this.#state.modifiers;
        const withCtrl = mods.has("ctrl");
        const withAlt = mods.has("alt");
        const withShift = this.#state.shift !== "off";
        this.#adapter.execute({
          kind: "moveCursor",
          direction: a.direction,
          word: withCtrl || withAlt,
          select: withShift,
        });
        if (!withShift) this.#clearArmedModifiers();
        return !(withCtrl || withAlt);
      }
      case "insert":
        this.#adapter.execute({ kind: "raw", data: "\x1b[2~" });
        return true;
      case "deleteForward":
        this.#adapter.execute({ kind: "deleteForward" });
        return true;
      case "modifier":
        this.#toggleModifier(a.modifier);
        return false;
    }
  }

  #toggleModifier(modifier: Modifier): void {
    const now = performance.now();
    const prev = this.#lastModifierTap.get(modifier) ?? 0;
    const doubleTap = now - prev < this.#doubleTapMs;
    this.#lastModifierTap.set(modifier, now);
    const current = this.#state.modifiers.get(modifier);
    if (doubleTap && current === "armed") {
      this.#state.modifiers.set(modifier, "locked");
    } else if (current === undefined) {
      this.#state.modifiers.set(modifier, "armed");
    } else {
      this.#state.modifiers.delete(modifier);
    }
    this.#renderTopbar();
  }

  #emitTab(): void {
    const mods = [...this.#state.modifiers.keys()];
    if (mods.length > 0) {
      this.#adapter.execute({ kind: "combo", modifiers: mods, key: "Tab" });
    } else {
      this.#adapter.execute({ kind: "tab" });
    }
    this.#clearArmedModifiers();
  }

  #clearArmedModifiers(): void {
    let changed = false;
    for (const [mod, state] of this.#state.modifiers) {
      if (state === "armed") {
        this.#state.modifiers.delete(mod);
        changed = true;
      }
    }
    if (changed) this.#renderTopbar();
  }

  #attachDragScroll(el: HTMLElement): void {
    const signal = this.#controller!.signal;
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let pointerId = -1;
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(".tb-key")) return;
      dragging = true;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
    }, { signal });
    el.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      el.scrollLeft = startScroll - (e.clientX - startX);
    }, { signal });
    const stop = (e: PointerEvent): void => {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      pointerId = -1;
      el.classList.remove("dragging");
    };
    el.addEventListener("pointerup", stop, { signal });
    el.addEventListener("pointercancel", stop, { signal });
    el.addEventListener("wheel", (e) => {
      if (e.deltaY === 0) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false, signal });
  }

  #render(): void {
    const container = this.#root.querySelector(".keyboard");
    if (!container) return;
    const layer = layouts[this.#state.locale].layers[this.#state.layer];
    const target = Math.max(
      ...layer.rows.map((r) =>
        r.every((k) => k.action.kind === "char") ? r.length : 0,
      ),
    );
    container.replaceChildren(
      ...layer.rows.map((r, i) => this.#renderRow(r, i, target)),
    );
  }

  #renderRow(keys: Key[], index: number, target: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.row = String(index);

    const resolved: number[] = keys.map((k) => (k.fill ? 0 : k.flex ?? 1));
    const fillCount = keys.filter((k) => k.fill).length;

    if (fillCount > 0) {
      const fixed = resolved.reduce((s, v) => s + v, 0);
      const fr = Math.max(0, (target - fixed) / fillCount);
      for (let i = 0; i < keys.length; i++) if (keys[i]!.fill) resolved[i] = fr;
    }

    const first = keys[0];
    const last = keys[keys.length - 1];
    const hasEdgeMods =
      keys.length >= 3 &&
      first !== undefined && first.action.kind !== "char" &&
      last !== undefined && last.action.kind !== "char";
    const total = resolved.reduce((a, b) => a + b, 0);

    let tracks: string[];
    if (fillCount === 0 && hasEdgeMods && total < target) {
      const pad = (target - total) / 2;
      const firstKey = this.#renderKey(keys[0]!);
      const lastKey = this.#renderKey(keys[keys.length - 1]!);
      const innerKeys = keys.slice(1, -1).map((k) => this.#renderKey(k));
      tracks = [
        `${resolved[0]}fr`,
        `${pad}fr`,
        ...resolved.slice(1, -1).map((f) => `${f}fr`),
        `${pad}fr`,
        `${resolved[resolved.length - 1]}fr`,
      ];
      row.append(firstKey, this.#spacer(), ...innerKeys, this.#spacer(), lastKey);
    } else if (fillCount === 0 && total < target) {
      const pad = (target - total) / 2;
      tracks = [`${pad}fr`, ...resolved.map((f) => `${f}fr`), `${pad}fr`];
      row.append(this.#spacer(), ...keys.map((k) => this.#renderKey(k)), this.#spacer());
    } else {
      tracks = resolved.map((f) => `${f}fr`);
      row.append(...keys.map((k) => this.#renderKey(k)));
    }
    row.style.gridTemplateColumns = tracks.join(" ");

    return row;
  }

  #spacer(): HTMLElement {
    const el = document.createElement("span");
    el.className = "spacer";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  #renderKey(key: Key): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.className = "key";
    btn.dataset.action = key.action.kind;
    if (key.action.kind === "char") btn.classList.add("char");
    if (key.action.kind !== "char") btn.classList.add("mod");
    if (key.action.kind === "space") btn.classList.add("space");
    if (key.action.kind === "shift" && this.#state.shift !== "off") {
      btn.classList.add("active");
      if (this.#state.shift === "locked") btn.classList.add("locked");
    }
    btn.textContent = this.#displayLabel(key);
    if (key.alternates && key.alternates.length > 0) btn.dataset.hasAlts = "true";

    this.#keyForButton.set(btn, key);
    return btn;
  }

  #onGridPointerDown(e: PointerEvent): void {
    const btn = (e.target as Element | null)?.closest(".key") as HTMLButtonElement | null;
    if (!btn) return;
    const key = this.#keyForButton.get(btn);
    if (!key) return;
    const hasAlts = !!(key.alternates && key.alternates.length > 0);
    if (hasAlts) {
      this.#onPointerDown(e, key, btn);
      return;
    }
    if (key.action.kind === "char") {
      this.#showSimplePreview(key, btn, e.pointerId);
    }
    if (isRepeatableKey(key)) {
      this.#startRepeat(key, e.pointerId);
    } else {
      this.#handle(key);
    }
  }

  #onGridPointerUp(e: PointerEvent): void {
    if (this.#repeat?.pointerId === e.pointerId) this.#stopRepeat();
    if (this.#press?.pointerId === e.pointerId) this.#onPointerUp(e);
    if (this.#simplePreview?.pointerId === e.pointerId) this.#clearSimplePreview();
  }

  #onGridPointerCancel(e: PointerEvent): void {
    if (this.#repeat?.pointerId === e.pointerId) this.#stopRepeat();
    if (this.#press?.pointerId === e.pointerId) this.#cancelPress();
    if (this.#simplePreview?.pointerId === e.pointerId) this.#clearSimplePreview();
  }

  #previewLabel(key: Key): string {
    const base = this.#displayLabel(key);
    if (
      key.action.kind === "char" &&
      this.#state.shift !== "off" &&
      this.#state.layer === "letters"
    ) {
      return base.toUpperCase();
    }
    return base;
  }

  #showSimplePreview(key: Key, btn: HTMLButtonElement, pointerId: number): void {
    this.#clearSimplePreview();
    const label = this.#previewLabel(key);
    if (!label) return;
    const popover = document.createElement("div");
    popover.className = "popover preview";
    popover.setAttribute("role", "presentation");
    const bubble = document.createElement("span");
    bubble.className = "preview-key";
    bubble.textContent = label;
    popover.append(bubble);
    const container = this.#root.querySelector(".keyboard");
    container?.append(popover);
    this.#positionPopover(popover, btn);
    this.#simplePreview = { popover, pointerId };
  }

  #clearSimplePreview(): void {
    this.#simplePreview?.popover.remove();
    this.#simplePreview = null;
  }

  #startRepeat(key: Key, pointerId: number): void {
    this.#stopRepeat();
    this.#handle(key);
    const r: Repeat = { key, pointerId, initial: null, interval: null };
    r.initial = window.setTimeout(() => {
      r.initial = null;
      r.interval = window.setInterval(() => this.#handle(key), this.#repeatIntervalMs);
    }, this.#repeatInitialMs);
    this.#repeat = r;
  }

  #stopRepeat(): void {
    const r = this.#repeat;
    if (!r) return;
    if (r.initial !== null) clearTimeout(r.initial);
    if (r.interval !== null) clearInterval(r.interval);
    this.#repeat = null;
  }

  #displayLabel(key: Key): string {
    if (key.action.kind === "shift") {
      return this.#state.shift === "locked" ? "⇪" : "⇧";
    }
    return key.label;
  }

  #applyShiftState(): void {
    const root = this.#root.querySelector(".vk");
    if (!root) return;
    root.classList.toggle("shift", this.#state.shift !== "off");
    root.classList.toggle("shift-locked", this.#state.shift === "locked");
    const shiftBtn = this.#root.querySelector<HTMLButtonElement>('.key[data-action="shift"]');
    if (shiftBtn) {
      shiftBtn.textContent = this.#state.shift === "locked" ? "⇪" : "⇧";
      shiftBtn.classList.toggle("active", this.#state.shift !== "off");
      shiftBtn.classList.toggle("locked", this.#state.shift === "locked");
    }
  }

  #onPointerDown(e: PointerEvent, key: Key, btn: HTMLButtonElement): void {
    if (this.#press) this.#cancelPress();
    const hasAlts = !!(key.alternates && key.alternates.length > 0);
    if (!hasAlts) {
      this.#handle(key);
      return;
    }
    btn.setPointerCapture(e.pointerId);

    const upperAtDown = this.#state.shift !== "off" && this.#state.layer === "letters";
    let committedChar: string | null = null;
    if (key.action.kind === "char" && this.#state.modifiers.size === 0) {
      committedChar = upperAtDown ? key.action.value.toUpperCase() : key.action.value;
      this.#emit(committedChar);
      if (this.#state.shift === "on") {
        this.#state.shift = "off";
        this.#applyShiftState();
      }
    }

    const press: Press = {
      key,
      button: btn,
      pointerId: e.pointerId,
      timer: null,
      popover: null,
      alts: [],
      selectedIndex: 0,
      committed: committedChar !== null,
      committedChar,
      upperAtDown,
      controller: new AbortController(),
    };
    this.#press = press;

    if (committedChar !== null) this.#showPreview(committedChar);
    press.timer = window.setTimeout(() => this.#openPopover(), this.#longPressMs);
  }

  #showPreview(label: string): void {
    const p = this.#press;
    if (!p) return;
    const popover = document.createElement("div");
    popover.className = "popover preview";
    popover.setAttribute("role", "presentation");
    const bubble = document.createElement("span");
    bubble.className = "preview-key";
    bubble.textContent = label;
    popover.append(bubble);
    const container = this.#root.querySelector(".keyboard");
    container?.append(popover);
    this.#positionPopover(popover, p.button);
    p.popover = popover;
  }

  #trackAltsAt(clientX: number, clientY: number): void {
    const p = this.#press;
    if (!p || !p.popover) return;
    const hit = this.#root.elementFromPoint(clientX, clientY);
    const idx = p.alts.findIndex((a) => a === hit);
    if (idx < 0 || idx === p.selectedIndex) return;
    p.alts[p.selectedIndex]?.classList.remove("active");
    p.alts[idx]?.classList.add("active");
    p.selectedIndex = idx;
  }

  #onPointerUp(_e: PointerEvent): void {
    const p = this.#press;
    if (!p) return;
    if (p.timer !== null) {
      clearTimeout(p.timer);
      p.timer = null;
    }
    if (p.alts.length > 0) {
      const chosen = p.key.alternates?.[p.selectedIndex];
      if (chosen !== undefined) {
        const alternative = p.upperAtDown ? chosen.toUpperCase() : chosen;
        if (p.committed) {
          if (alternative !== p.committedChar) {
            this.#adapter.execute({ kind: "backspace" });
            this.#emit(alternative);
          }
        } else {
          this.#emitChar(chosen);
        }
      }
    } else if (!p.committed) {
      this.#handle(p.key);
    }
    if (p.popover) this.#closePopover();
    p.controller.abort();
    this.#press = null;
  }

  #cancelPress(): void {
    const p = this.#press;
    if (!p) return;
    if (p.timer !== null) clearTimeout(p.timer);
    if (p.popover) this.#closePopover();
    p.controller.abort();
    this.#press = null;
  }

  #openPopover(): void {
    const p = this.#press;
    if (!p || !p.key.alternates) return;
    const alts = p.key.alternates;
    const upper = p.upperAtDown;

    const popover = p.popover ?? document.createElement("div");
    popover.className = "popover";
    popover.setAttribute("role", "listbox");
    popover.replaceChildren();

    const altButtons: HTMLButtonElement[] = alts.map((alt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "alt";
      b.dataset.idx = String(i);
      b.textContent = upper ? alt.toUpperCase() : alt;
      popover.append(b);
      return b;
    });
    altButtons[0]?.classList.add("active");

    if (!p.popover) {
      const container = this.#root.querySelector(".keyboard");
      container?.append(popover);
    }
    this.#positionPopover(popover, p.button);

    p.popover = popover;
    p.alts = altButtons;
    p.selectedIndex = 0;

    let pendingX = 0;
    let pendingY = 0;
    let rafId = 0;
    const flush = (): void => {
      rafId = 0;
      this.#trackAltsAt(pendingX, pendingY);
    };
    p.button.addEventListener(
      "pointermove",
      (ev) => {
        pendingX = ev.clientX;
        pendingY = ev.clientY;
        if (rafId === 0) rafId = requestAnimationFrame(flush);
      },
      { signal: p.controller.signal },
    );
    p.controller.signal.addEventListener(
      "abort",
      () => {
        if (rafId !== 0) cancelAnimationFrame(rafId);
      },
      { once: true },
    );
  }

  #positionPopover(popover: HTMLElement, anchor: HTMLButtonElement): void {
    const anchorRect = anchor.getBoundingClientRect();
    if (popover.classList.contains("preview")) {
      popover.style.width = `${anchorRect.width}px`;
    } else {
      popover.style.width = "";
    }

    const margin = 4;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const popRect = popover.getBoundingClientRect();
    const gap = 6;

    const preferredTop = anchorRect.top - popRect.height - gap;
    const top =
      preferredTop >= margin
        ? preferredTop
        : Math.min(anchorRect.bottom + gap, vh - popRect.height - margin);

    const preferredLeft = anchorRect.left + anchorRect.width / 2 - popRect.width / 2;
    const left = Math.max(
      margin,
      Math.min(preferredLeft, vw - popRect.width - margin),
    );

    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(margin, top)}px`;
  }

  #closePopover(): void {
    const p = this.#press;
    p?.popover?.remove();
    if (p) {
      p.popover = null;
      p.alts = [];
    }
  }

  #emitChar(value: string): void {
    const upper = this.#state.shift !== "off" && this.#state.layer === "letters";
    const char = upper ? value.toUpperCase() : value;
    if (this.#state.modifiers.size > 0) {
      this.#adapter.execute({
        kind: "combo",
        modifiers: [...this.#state.modifiers.keys()],
        key: char,
      });
      this.dispatchEvent(
        new CustomEvent("vk-input", { detail: { text: char }, bubbles: true, composed: true }),
      );
      this.#clearArmedModifiers();
    } else {
      this.#emit(char);
    }
    if (this.#state.shift === "on") {
      this.#state.shift = "off";
      this.#applyShiftState();
    }
  }

  #handle(key: Key): void {
    const a = key.action;
    switch (a.kind) {
      case "char":
        this.#emitChar(a.value);
        break;
      case "space":
        this.#emitKey(" ", " ");
        break;
      case "return":
        this.#emitKey("\n", "Enter");
        break;
      case "backspace":
        this.#adapter.execute({ kind: "backspace" });
        this.dispatchEvent(new CustomEvent("vk-backspace", { bubbles: true, composed: true }));
        this.#clearArmedModifiers();
        break;
      case "shift":
        this.#toggleShift();
        break;
      case "layer":
        this.#state.layer = a.id;
        this.#state.shift = "off";
        this.#render();
        break;
      case "globe":
        this.#cycleLocale();
        break;
    }
  }

  #toggleShift(): void {
    const now = performance.now();
    const isDoubleTap = now - this.#lastShiftTap < this.#doubleTapMs;
    this.#lastShiftTap = now;

    if (isDoubleTap && this.#state.shift === "on") {
      this.#state.shift = "locked";
    } else if (this.#state.shift === "off") {
      this.#state.shift = "on";
    } else {
      this.#state.shift = "off";
    }
    this.#applyShiftState();
  }

  #cycleLocale(): void {
    const i = locales.indexOf(this.#state.locale);
    const next = locales[(i + 1) % locales.length]!;
    this.locale = next;
    this.dispatchEvent(
      new CustomEvent("vk-locale", { detail: { locale: next }, bubbles: true, composed: true }),
    );
  }

  #emit(text: string): void {
    this.#adapter.execute({ kind: "insertText", text });
    this.dispatchEvent(
      new CustomEvent("vk-input", { detail: { text }, bubbles: true, composed: true }),
    );
  }

  #emitKey(text: string, comboKey: string): void {
    if (this.#state.modifiers.size > 0) {
      this.#adapter.execute({
        kind: "combo",
        modifiers: [...this.#state.modifiers.keys()],
        key: comboKey,
      });
      this.dispatchEvent(
        new CustomEvent("vk-input", { detail: { text }, bubbles: true, composed: true }),
      );
      this.#clearArmedModifiers();
    } else {
      this.#emit(text);
    }
  }
}

customElements.define("virtual-keyboard", VirtualKeyboard);

declare global {
  interface HTMLElementTagNameMap {
    "virtual-keyboard": VirtualKeyboard;
  }
  interface HTMLElementEventMap {
    "vk-input": CustomEvent<{ text: string }>;
    "vk-backspace": CustomEvent;
    "vk-locale": CustomEvent<{ locale: Locale }>;
  }
}
