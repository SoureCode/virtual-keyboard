import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const HOST = "https://copy.sh/v86/";

const files = [
  {
    url: HOST + "bios/seabios.bin",
    out: "public/v86/bios/seabios.bin",
    sha256: "73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98",
  },
  {
    url: HOST + "bios/vgabios.bin",
    out: "public/v86/bios/vgabios.bin",
    sha256: "a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880",
  },
  {
    url: HOST + "images/linux4.iso",
    out: "public/v86/images/linux.iso",
    sha256: "cb403835be0d857191cdeb86efc8d559b94a787d6fcb57e0a04667296405c223",
  },
];

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const sha256 = async (path) => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
};

const download = async (url, outRel, expectedHash) => {
  const out = join(root, outRel);
  if (existsSync(out) && statSync(out).size > 0) {
    const actual = await sha256(out);
    if (actual === expectedHash) {
      console.log(`✓ cached ${outRel}`);
      return;
    }
    console.warn(`! hash mismatch for cached ${outRel}; re-downloading`);
    unlinkSync(out);
  }
  mkdirSync(dirname(out), { recursive: true });
  console.log(`↓ ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    const snippet = await res.text().catch(() => "");
    throw new Error(
      `${url} → ${res.status} ${res.statusText} ${snippet.slice(0, 120).replace(/\s+/g, " ")}`.trim(),
    );
  }
  const tmp = out + ".part";
  try {
    await pipeline(res.body, createWriteStream(tmp));
    const actual = await sha256(tmp);
    if (actual !== expectedHash) {
      throw new Error(`sha256 mismatch for ${outRel}: got ${actual}, expected ${expectedHash}`);
    }
    renameSync(tmp, out);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw e;
  }
  console.log(`  saved ${outRel} (${statSync(out).size} bytes)`);
};

for (const f of files) {
  try {
    await download(f.url, f.out, f.sha256);
  } catch (e) {
    console.error(`failed ${f.url}:`, e.message);
    process.exitCode = 1;
  }
}

const wasms = ["v86.wasm", "v86-fallback.wasm"];
for (const name of wasms) {
  const src = join(root, "node_modules/v86/build", name);
  const out = join(root, "public/v86/build", name);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(src, out);
  console.log(`✓ copied ${name}`);
}
