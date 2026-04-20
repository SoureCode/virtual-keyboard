import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import V86, { type V86Listener } from "v86";
import "./keyboard/virtual-keyboard";
import { terminalAdapter } from "./keyboard/output";

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
term.textarea?.setAttribute("inputmode", "none");
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

const emulator = new V86({
  wasm_path: HOST + "build/v86.wasm",
  memory_size: 128 * 1024 * 1024,
  vga_memory_size: 2 * 1024 * 1024,
  bios: { url: HOST + "bios/seabios.bin" },
  vga_bios: { url: HOST + "bios/vgabios.bin" },
  cdrom: { url: HOST + "images/linux.iso" },
  autostart: true,
  acpi: true,
  disable_keyboard: true,
  disable_mouse: true,
  disable_speaker: true,
});

const listeners: Array<[string, V86Listener]> = [];
const listen = (event: string, cb: V86Listener): void => {
  emulator.add_listener(event, cb);
  listeners.push([event, cb]);
};

listen("emulator-ready", () => setStatus("ready"));
listen("emulator-started", () => setStatus("running"));
listen("download-progress", (e) => {
  const p = e as { loaded: number; total?: number; file_name?: string };
  if (p.total) {
    const pct = Math.round((p.loaded / p.total) * 100);
    setStatus(`downloading ${p.file_name ?? "image"} ${pct}%`);
  }
});

const send = (data: string): void => {
  emulator.serial0_send(data);
};

listen("serial0-output-byte", (byte) => {
  term.write(Uint8Array.from([byte as number]));
});

term.onData(send);

const kb = document.querySelector("virtual-keyboard")!;
kb.setAdapter(terminalAdapter(send));

term.focus();

window.addEventListener(
  "beforeunload",
  () => {
    ro.disconnect();
    for (const [event, cb] of listeners) emulator.remove_listener(event, cb);
    term.dispose();
  },
  { once: true },
);
