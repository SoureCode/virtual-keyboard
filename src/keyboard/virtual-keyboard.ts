import stylesheetUrl from "./virtual-keyboard.scss?url";
import {
  isLocale,
  layouts,
  locales,
  type Key,
  type LayerId,
  type Locale,
} from "./layouts";
import { nativeAdapter, type OutputAdapter } from "./output";

type ShiftState = "off" | "on" | "locked";

type State = {
  locale: Locale;
  layer: LayerId;
  shift: ShiftState;
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
};

const DEFAULT_LOCALE: Locale = "en";
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 350;

export class VirtualKeyboard extends HTMLElement {
  static observedAttributes = ["locale"];

  #state: State = { locale: DEFAULT_LOCALE, layer: "letters", shift: "off" };
  #root: ShadowRoot;
  #lastShiftTap = 0;
  #adapter: OutputAdapter = nativeAdapter();
  #press: Press | null = null;

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
    }
  }

  connectedCallback(): void {
    this.#root.innerHTML = `
      <link rel="stylesheet" href="${stylesheetUrl}">
      <div class="keyboard" part="keyboard"></div>
    `;
    const container = this.#root.querySelector(".keyboard");
    const swallowFocus = (e: Event): void => e.preventDefault();
    container?.addEventListener("pointerdown", swallowFocus);
    container?.addEventListener("mousedown", swallowFocus);
    container?.addEventListener("touchstart", swallowFocus, { passive: false });
    this.#render();
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
    if (key.action.kind !== "char") btn.classList.add("mod");
    if (key.action.kind === "space") btn.classList.add("space");
    if (key.action.kind === "shift" && this.#state.shift !== "off") {
      btn.classList.add("active");
      if (this.#state.shift === "locked") btn.classList.add("locked");
    }
    btn.textContent = this.#displayLabel(key);
    if (key.alternates && key.alternates.length > 0) btn.dataset.hasAlts = "true";

    btn.addEventListener("pointerdown", (e) => this.#onPointerDown(e, key, btn));
    btn.addEventListener("pointermove", (e) => this.#onPointerMove(e));
    btn.addEventListener("pointerup", (e) => this.#onPointerUp(e));
    btn.addEventListener("pointercancel", () => this.#cancelPress());
    return btn;
  }

  #displayLabel(key: Key): string {
    if (key.action.kind === "shift") {
      return this.#state.shift === "locked" ? "⇪" : "⇧";
    }
    if (key.action.kind === "char" && this.#state.layer === "letters") {
      return this.#state.shift !== "off" ? key.label.toUpperCase() : key.label;
    }
    return key.label;
  }

  #onPointerDown(e: PointerEvent, key: Key, btn: HTMLButtonElement): void {
    if (this.#press) this.#cancelPress();
    const hasAlts = !!(key.alternates && key.alternates.length > 0);
    if (!hasAlts) {
      this.#handle(key);
      return;
    }
    btn.setPointerCapture(e.pointerId);
    const press: Press = {
      key,
      button: btn,
      pointerId: e.pointerId,
      timer: null,
      popover: null,
      alts: [],
      selectedIndex: 0,
      committed: false,
    };
    press.timer = window.setTimeout(() => this.#openPopover(), LONG_PRESS_MS);
    this.#press = press;
  }

  #onPointerMove(e: PointerEvent): void {
    const p = this.#press;
    if (!p || !p.popover) return;
    const hit = this.#root.elementFromPoint(e.clientX, e.clientY);
    const idx = p.alts.findIndex((a) => a === hit);
    if (idx >= 0 && idx !== p.selectedIndex) {
      p.alts[p.selectedIndex]?.classList.remove("active");
      p.alts[idx]?.classList.add("active");
      p.selectedIndex = idx;
    }
  }

  #onPointerUp(_e: PointerEvent): void {
    const p = this.#press;
    if (!p) return;
    if (p.timer !== null) {
      clearTimeout(p.timer);
      p.timer = null;
    }
    if (p.popover) {
      const alts = p.key.alternates ?? [];
      const choice = alts[p.selectedIndex] ?? p.key.label;
      this.#emitChar(choice);
      this.#closePopover();
    } else if (!p.committed) {
      this.#handle(p.key);
    }
    this.#press = null;
  }

  #cancelPress(): void {
    const p = this.#press;
    if (!p) return;
    if (p.timer !== null) clearTimeout(p.timer);
    if (p.popover) this.#closePopover();
    this.#press = null;
  }

  #openPopover(): void {
    const p = this.#press;
    if (!p || !p.key.alternates) return;
    const alts = p.key.alternates;
    const upper = this.#state.shift !== "off" && this.#state.layer === "letters";

    const popover = document.createElement("div");
    popover.className = "popover";
    popover.setAttribute("role", "listbox");

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

    const container = this.#root.querySelector(".keyboard");
    container?.append(popover);
    this.#positionPopover(popover, p.button);

    p.popover = popover;
    p.alts = altButtons;
    p.selectedIndex = 0;
  }

  #positionPopover(popover: HTMLElement, anchor: HTMLButtonElement): void {
    const anchorRect = anchor.getBoundingClientRect();
    popover.style.minWidth = `${anchorRect.width}px`;

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
    this.#emit(upper ? value.toUpperCase() : value);
    if (this.#state.shift === "on") {
      this.#state.shift = "off";
      this.#render();
    }
  }

  #handle(key: Key): void {
    const a = key.action;
    switch (a.kind) {
      case "char":
        this.#emitChar(a.value);
        break;
      case "space":
        this.#emit(" ");
        break;
      case "return":
        this.#emit("\n");
        break;
      case "backspace":
        this.#adapter.execute({ kind: "backspace" });
        this.dispatchEvent(new CustomEvent("vk-backspace", { bubbles: true, composed: true }));
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
    const isDoubleTap = now - this.#lastShiftTap < DOUBLE_TAP_MS;
    this.#lastShiftTap = now;

    if (isDoubleTap && this.#state.shift === "on") {
      this.#state.shift = "locked";
    } else if (this.#state.shift === "off") {
      this.#state.shift = "on";
    } else {
      this.#state.shift = "off";
    }
    this.#render();
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
