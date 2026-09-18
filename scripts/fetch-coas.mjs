#!/usr/bin/env node
// Wyld's COA lookup is a WordPress custom post type with a public sitemap: every batch
// of gummies sold in AZ/NY/NJ has a result page linking its lab PDF. This script walks
// that sitemap and builds data/coa-index.json — batch number, state, product line, and
// the PDF URL — and optionally downloads and parses the PDFs themselves.
//
//   node scripts/fetch-coas.mjs            # index every batch page
//   node scripts/fetch-coas.mjs --pdfs     # then download + parse every PDF
//   node scripts/fetch-coas.mjs --pdfs ny  # PDFs for one state code
//
// PDF parsing shells out to pdftotext (poppler). The newer NY/NJ certificates carry a
// text layer and parse exactly; the 2024 AZ ones are page scans with no text layer, so
// they are recorded as `scanned: true` rather than parsed (see README).
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseCoaText } from "./lib/coa-text.mjs";

const root = path.resolve(import.meta.dirname, "..");
const BASE = "https://www.wyldcanna.com";
const UA = "terpedia-wyld (dan@terpedia.com)";
const SITEMAPS = ["/coa-result-sitemap.xml", "/coa-result-sitemap2.xml"];
const INDEX = path.join(root, "data/coa-index.json");
const PDF_DIR = "/tmp/wyld-coas"; // PDFs are a source, not an artifact: parse to data/, keep out of the repo

const execFileP = promisify(execFile);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => s
  .replace(/&#8217;/g, "’").replace(/&#038;|&amp;/g, "&").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA } });
      if (r.ok) return r;
      if (r.status < 500) throw new Error(`${r.status}`);
    } catch (e) {
      if (attempt === 3) throw e;
    }
    await wait(attempt * 1500);
  }
  throw new Error(`unreachable ${url}`);
}

// A batch slug is {state}[-extra…]-b{number}; the sitemap also lists impact reports and
// media pages under the same path, which do not match.
const BATCH_SLUG = /^[a-z]{2}(?:-[a-z0-9]+)*-b\d+$/;

function parseCoaPage(html) {
  const pdf = html.match(/<a class="sheet-download"[^>]*href="([^"]+\.pdf)"/)?.[1] || null;
  const batch = html.match(/<div class="heading">Batch<\/div>\s*<div class="value">([^<]+)<\/div>/)?.[1] || null;
  const content = html.match(/<div class="content"><p>([\s\S]*?)<\/p>\s*<\/div>/)?.[1] || null;
  // AZ/NJ pages carry more meta cells: harvest/manufacture dates, extraction, distillate parent.
  const meta = {};
  for (const m of html.matchAll(/<div class="heading">([^<]+)<\/div>\s*<div class="value">([^<]+)<\/div>/g)) {
    meta[text(m[1]).toLowerCase()] = text(m[2]);
  }
  return { pdf, batch, content, meta };
}

// --- index every batch page ---
// Resumable: interrupted runs leave a checkpoint without `complete`, and the next run
// skips every handle already saved.
const saved = await fs.readFile(INDEX, "utf8").then(JSON.parse).catch(() => null);
const index = saved?.batches ?? [];
if (saved?.complete !== true) {
  const urls = new Set();
  for (const s of SITEMAPS) {
    const xml = await (await get(`${BASE}${s}`)).text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(m[1].replace(/\/$/, ""));
  }
  const pages = [...urls].filter((u) => BATCH_SLUG.test(u.split("/coa-lookup/")[1] || ""));
  console.log(`${pages.length} batch pages on the sitemap`);
  const done = new Set(index.map((b) => b.handle));
  let count = 0;
  for (const url of pages) {
    const handle = url.split("/coa-lookup/")[1].replace(/\/$/, "");
    if (done.has(handle)) continue;
    try {
      const html = await (await get(url)).text();
      const p = parseCoaPage(html);
      const state = (p.batch || handle).match(/^[A-Za-z]{2}/)?.[0]?.toUpperCase() || handle.slice(0, 2).toUpperCase();
      index.push({
        handle, url, state,
        batch: p.batch || handle.toUpperCase().replaceAll("-", " "),
        product_line: p.content,
        pdf: p.pdf,
        meta: p.meta,
      });
    } catch (e) {
      console.warn(`  ! ${handle}: ${e.message}`);
    }
    if (++count % 100 === 0) {
      console.log(`  ${index.length}/${pages.length}`);
      // Incremental checkpoint so an interrupted run keeps its work.
      await fs.writeFile(INDEX, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: `${BASE}/us/coa-lookup/`, batches: index }, null, 1)}\n`);
    }
    await wait(140); // ~7 req/s, comfortably under the site's cache
  }
  index.sort((a, b) => a.handle.localeCompare(b.handle));
  await fs.writeFile(INDEX, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: `${BASE}/us/coa-lookup/`, complete: true, batches: index }, null, 1)}\n`);
  console.log(`Wrote ${INDEX} (${index.length} batches)`);
}

// --- download + parse PDFs ---
// --reparse skips downloading and re-extracts every PDF already on disk (e.g. after a
// parser fix); the index is updated in place so no state is ever dropped.
const reparse = process.argv.includes("--reparse");
const wantPdfs = reparse || process.argv.includes("--pdfs");
const pdfsIdx = process.argv.indexOf("--pdfs");
const stateFilter = pdfsIdx > -1 ? process.argv.slice(pdfsIdx + 1).find((a) => !a.startsWith("--")) ?? null : null;
if (wantPdfs) {
  await fs.mkdir(PDF_DIR, { recursive: true });
  const targets = index.filter((b) => b.pdf && (!stateFilter || b.state === stateFilter.toUpperCase()));
  console.log(`${targets.length} PDFs ${reparse ? "to re-parse from disk" : `to fetch${stateFilter ? ` (${stateFilter.toUpperCase()})` : ""}`}`);
  let parsed = 0, scanned = 0, failed = 0;
  for (const [n, b] of targets.entries()) {
    const file = path.join(PDF_DIR, `${b.handle}.pdf`);
    const have = await fs.stat(file).then(() => true).catch(() => false);
    if (!have && reparse) continue;
    if (!have) {
      try { await fs.writeFile(file, Buffer.from(await (await get(b.pdf)).arrayBuffer())); }
      catch (e) { console.warn(`  ! pdf ${b.handle}: ${e.message}`); failed += 1; continue; }
    }
    let raw = "";
    try { raw = (await execFileP("pdftotext", ["-layout", file, "-"])).stdout; } catch { raw = ""; }
    for (const k of ["parse_status", "product", "cannabinoids", "terpenes", "totals"]) delete b[k];
    if (raw.replace(/\s/g, "").length < 200) {
      b.parse_status = "scanned";
      scanned += 1;
    } else {
      Object.assign(b, parseCoaText(raw), { parse_status: "parsed" });
      parsed += 1;
    }
    if ((n + 1) % 50 === 0) console.log(`  ${n + 1}/${targets.length} — ${parsed} parsed, ${scanned} scanned, ${failed} failed`);
    if (!reparse) await wait(140);
  }
  await fs.writeFile(INDEX, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: `${BASE}/us/coa-lookup/`, complete: true, batches: index }, null, 1)}\n`);
  console.log(`Parsed ${parsed}, scanned ${scanned}, failed ${failed} → ${INDEX}`);
}

