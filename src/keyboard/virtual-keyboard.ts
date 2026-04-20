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

const DEFAULT_LOCALE: Locale = "en";
const DOUBLE_TAP_MS = 300;

export class VirtualKeyboard extends HTMLElement {
  static observedAttributes = ["locale"];

  #state: State = { locale: DEFAULT_LOCALE, layer: "letters", shift: "off" };
  #root: ShadowRoot;
  #lastShiftTap = 0;
  #adapter: OutputAdapter = nativeAdapter();

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
    btn.addEventListener("pointerdown", () => this.#handle(key));
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

  #handle(key: Key): void {
    const a = key.action;
    switch (a.kind) {
      case "char": {
        const upper = this.#state.shift !== "off" && this.#state.layer === "letters";
        this.#emit(upper ? a.value.toUpperCase() : a.value);
        if (this.#state.shift === "on") {
          this.#state.shift = "off";
          this.#render();
        }
        break;
      }
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
