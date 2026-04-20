import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
// @ts-expect-error — v86 ships no types
import V86 from "v86";
import wasmUrl from "v86/build/v86.wasm?url";
import "./keyboard/virtual-keyboard";
import { terminalAdapter } from "./keyboard/output";

type V86Instance = {
  add_listener(event: string, cb: (...args: unknown[]) => void): void;
  serial0_send(data: string): void;
  stop(): Promise<void>;
  restart(): void;
};

type V86Ctor = new (options: Record<string, unknown>) => V86Instance;

const V86Constructor = V86 as V86Ctor;

const HOST = import.meta.env.BASE_URL + "v86/";

const term = new Terminal({
  cursorBlink: true,
  allowProposedApi: true,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 14,
  theme: {
    background: "#0b1220",
    foreground: "#cbd5e1",
    cursor: "#10b981",
  },
});

const fit = new FitAddon();
term.loadAddon(fit);
term.loadAddon(new ClipboardAddon());
term.loadAddon(new ProgressAddon());
term.loadAddon(new WebLinksAddon());

const host = document.getElementById("term")!;
term.open(host);
fit.fit();
term.loadAddon(new LigaturesAddon());

const ro = new ResizeObserver(() => {
  try {
    fit.fit();
  } catch {}
});
ro.observe(host);

const status = document.getElementById("status")!;
const setStatus = (text: string): void => {
  status.textContent = text;
};

term.writeln("\x1b[1;36mLinux on v86\x1b[0m — x86 emulator in WebAssembly");
term.writeln("Booting from linux4.iso (busybox)…\r\n");

const emulator = new V86Constructor({
  wasm_path: wasmUrl,
  memory_size: 512 * 1024 * 1024,
  vga_memory_size: 8 * 1024 * 1024,
  bios: { url: HOST + "bios/seabios.bin" },
  vga_bios: { url: HOST + "bios/vgabios.bin" },
  cdrom: { url: HOST + "images/linux.iso" },
  autostart: true,
  acpi: true,
  disable_keyboard: true,
  disable_mouse: true,
  disable_speaker: true,
});

emulator.add_listener("emulator-ready", () => setStatus("ready"));
emulator.add_listener("emulator-started", () => setStatus("running"));
emulator.add_listener("download-progress", ((e: unknown) => {
  const p = e as { loaded: number; total?: number; file_name?: string };
  if (p.total) {
    const pct = Math.round((p.loaded / p.total) * 100);
    setStatus(`downloading ${p.file_name ?? "image"} ${pct}%`);
  }
}) as (...args: unknown[]) => void);

const send = (data: string): void => {
  emulator.serial0_send(data);
};

emulator.add_listener("serial0-output-byte", ((byte: unknown) => {
  term.write(Uint8Array.from([byte as number]));
}) as (...args: unknown[]) => void);

term.onData(send);

const kb = document.querySelector("virtual-keyboard")!;
kb.setAdapter(terminalAdapter(send));

term.focus();
