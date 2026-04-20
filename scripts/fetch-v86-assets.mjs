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

const remote = [
  {
    url: HOST + "bios/seabios.bin",
    out: "public/v86/bios/seabios.bin",
    size: 131072,
    sha256: "73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98",
  },
  {
    url: HOST + "bios/vgabios.bin",
    out: "public/v86/bios/vgabios.bin",
    size: 36352,
    sha256: "a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880",
  },
  {
    url: HOST + "images/linux4.iso",
    out: "public/v86/images/linux.iso",
    size: 7712768,
    sha256: "cb403835be0d857191cdeb86efc8d559b94a787d6fcb57e0a04667296405c223",
  },
];

const bundled = [
  { src: "node_modules/v86/build/v86.wasm", out: "public/v86/build/v86.wasm" },
  { src: "node_modules/v86/build/v86-fallback.wasm", out: "public/v86/build/v86-fallback.wasm" },
];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const verify = process.argv.includes("--verify") || process.env.CI === "true";

const sha256 = async (path) => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
};

const isCached = async (path, size, hash) => {
  if (!existsSync(path) || statSync(path).size !== size) return false;
  if (!verify) return true;
  return (await sha256(path)) === hash;
};

const fetchOne = async ({ url, out, size, sha256: expected }) => {
  const abs = join(root, out);
  if (await isCached(abs, size, expected)) {
    console.log(`✓ cached ${out}`);
    return;
  }
  if (existsSync(abs)) unlinkSync(abs);
  mkdirSync(dirname(abs), { recursive: true });
  console.log(`↓ ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    const snippet = await res.text().catch(() => "");
    throw new Error(
      `${url} → ${res.status} ${res.statusText} ${snippet.slice(0, 120).replace(/\s+/g, " ")}`.trim(),
    );
  }
  const tmp = abs + ".part";
  try {
    await pipeline(res.body, createWriteStream(tmp));
    const actual = await sha256(tmp);
    if (actual !== expected) {
      throw new Error(`sha256 mismatch for ${out}: got ${actual}, expected ${expected}`);
    }
    renameSync(tmp, abs);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw e;
  }
  console.log(`  saved ${out} (${statSync(abs).size} bytes)`);
};

const copyOne = ({ src, out }) => {
  const absSrc = join(root, src);
  const absOut = join(root, out);
  const srcSize = statSync(absSrc).size;
  if (existsSync(absOut) && statSync(absOut).size === srcSize) {
    console.log(`✓ cached ${out}`);
    return;
  }
  mkdirSync(dirname(absOut), { recursive: true });
  copyFileSync(absSrc, absOut);
  console.log(`  copied ${out}`);
};

let failed = false;
for (const f of remote) {
  try {
    await fetchOne(f);
  } catch (e) {
    console.error(`failed ${f.url}:`, e.message);
    failed = true;
  }
}
for (const f of bundled) copyOne(f);

if (failed) process.exitCode = 1;
