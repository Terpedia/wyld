#!/usr/bin/env node
// OCR the scanned Wyld batch certificates (the 2024 AZ/NJ PDFs have no text layer) for
// the summary box on page 2: product line, Total THC/CBD/CBG per serving and container,
// and whether the terpene panel was Tested or Not Tested. Renders with pdftoppm and
// reads with tesseract; both shell out. Values land on each batch in data/coa-index.json.
//
//   node scripts/ocr-coas.mjs                       # AZ Prickly Pear + Kiwi batches
//   node scripts/ocr-coas.mjs --state AZ            # every AZ batch (slow: ~2s/page)
//   node scripts/ocr-coas.mjs --handle az-kw-b109   # named batches
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = path.resolve(import.meta.dirname, "..");
const INDEX = path.join(root, "data/coa-index.json");
const PDF_DIR = process.env.WYLD_PDF_DIR || "/tmp/wyld-coas";
// Leptonica cannot open images under /tmp from some macOS sessions, so renders land
// inside the workspace and are cleaned up after.
const TMP = path.join(root, ".ocr-tmp");

const p = promisify(execFile);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const idx = JSON.parse(await fs.readFile(INDEX, "utf8"));
let batches = idx.batches;

const stateIdx = process.argv.indexOf("--state");
const handleIdx = process.argv.indexOf("--handle");
if (stateIdx > -1) batches = batches.filter((b) => b.state === process.argv[stateIdx + 1].toUpperCase());
if (handleIdx > -1) { const want = new Set(process.argv.slice(handleIdx + 1)); batches = batches.filter((b) => want.has(b.handle)); }
// Default: the batches whose terpene story matters most — the AZ-only Prickly Pear and
// the AZ Kiwi, the two flavors whose packs declare a botanical terpene blend.
if (stateIdx === -1 && handleIdx === -1) batches = batches.filter((b) => b.state === "AZ" && ["PM", "PPR", "KW"].includes(b.batch.split(/\s+/)[1]));
batches = batches.filter((b) => !b.ocr);
console.log(`${batches.length} batches to OCR`);

await fs.mkdir(TMP, { recursive: true });
let done = 0;
for (const b of batches) {
  const file = path.join(PDF_DIR, `${b.handle}.pdf`);
  if (!await fs.stat(file).then(() => true).catch(() => false)) { console.log(`  ! no pdf on disk for ${b.handle}`); continue; }
  const prefix = path.join(TMP, b.handle);
  await p("pdftoppm", ["-png", "-r", "150", "-f", "2", "-l", "2", file, prefix]).catch(() => {});
  const pngs = (await fs.readdir(TMP).catch(() => [])).filter((f) => f.startsWith(b.handle) && f.endsWith(".png"));
  if (!pngs.length) { console.log(`  ! no render ${b.handle}`); continue; }
  let text = "";
  try { text = (await p("tesseract", [path.join(TMP, pngs[0]), "-", "--psm", "6"])).stdout; } catch (e) { console.log(`  ! ocr ${b.handle}: ${String(e.message).split("\n")[0]}`); continue; }
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const grab = (label, unit) => {
    const i = lines.findIndex((l) => l.toUpperCase().replace(/\s+/g, " ").includes(label));
    if (i === -1) return null;
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      const m = lines[j].match(new RegExp(`([\\d.]+)\\s*mg/${unit}`, "i"));
      if (m) return Number(m[1]);
    }
    return null;
  };
  const terpI = lines.findIndex((l) => /Terpenes Total/i.test(l));
  const terpStatus = terpI > -1 ? lines.slice(terpI, terpI + 3).join(" ").match(/Not Tested|Tested/i)?.[0] ?? null : null;
  // Per-compound splits are too layout-dependent to trust from OCR; the total is the one
  // number the box always states next to its label. The parsed NY certificates carry the
  // reliable per-compound values.
  let totalCannabinoids = null;
  const cannI = lines.findIndex((l) => /Total Cannabinoids/i.test(l));
  if (cannI > -1) for (let j = Math.max(0, cannI - 4); j < Math.min(cannI + 5, lines.length); j++) {
    const m = lines[j].match(/([\d.]+)\s*mg\/serving/i);
    if (m) { totalCannabinoids = Number(m[1]); break; }
  }
  b.ocr = {
    product: lines.find((l) => /^wyld/i.test(l)) ?? null,
    total_cannabinoids_mg_serving: totalCannabinoids,
    terpenes: terpStatus ? terpStatus.toLowerCase().replace("not tested", "not_tested") : null,
  };
  done += 1;
  if (done % 10 === 0) {
    await fs.writeFile(INDEX, JSON.stringify(idx, null, 1));
    console.log(`  ${done}/${batches.length}`);
  }
  await wait(50);
}
await fs.writeFile(INDEX, JSON.stringify(idx, null, 1));
await fs.rm(TMP, { recursive: true, force: true });
console.log(`OCR'd ${done} batches → ${INDEX}`);
