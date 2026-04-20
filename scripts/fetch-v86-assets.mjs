import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const HOST = "https://copy.sh/v86/";

const files = [
  { url: HOST + "bios/seabios.bin", out: "public/v86/bios/seabios.bin" },
  { url: HOST + "bios/vgabios.bin", out: "public/v86/bios/vgabios.bin" },
  { url: HOST + "images/linux4.iso", out: "public/v86/images/linux.iso" },
];

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const download = async (url, outRel) => {
  const out = join(root, outRel);
  if (existsSync(out) && statSync(out).size > 0) {
    console.log(`✓ cached ${outRel}`);
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  console.log(`↓ ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url} → ${res.status}`);
  await pipeline(res.body, createWriteStream(out));
  console.log(`  saved ${outRel} (${statSync(out).size} bytes)`);
};

for (const f of files) {
  try {
    await download(f.url, f.out);
  } catch (e) {
    console.error(`failed ${f.url}:`, e.message);
    process.exitCode = 1;
  }
}
