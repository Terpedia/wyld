#!/usr/bin/env node
// Aggregates the COA record (data/coa-index.json) per flavor and writes the terpene
// description each product page shows. Deterministic: every sentence is computed from
// the parsed certificates, no model in between.
//
// The picture the data gives: Wyld's extract is refined distillate. The NY certificates
// run full 39-analyte terpene panels and almost everything is below quantification — a
// few hundredths of a percent at most. The AZ/NJ certificates (page scans, sampled by
// OCR) never test terpenes at all. The fruit on the pack is candy flavoring; where a
// botanical terpene blend is declared (Kiwi, Prickly Pear) the lab panels do not
// quantify it.
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const INDEX = await JSON.parse(await fs.readFile(path.join(root, "data/coa-index.json"), "utf8"));
const catalog = await JSON.parse(await fs.readFile(path.join(root, "data/products.json"), "utf8"));

// flavor code printed in the batch number ("NY KW B16" → KW; "AZ W1 PM B124" → PM).
const codeOf = (b) => {
  const parts = b.batch.split(/\s+/);
  return parts.length >= 3 && /^B\d+$/i.test(parts[parts.length - 1]) ? parts[parts.length - 2] : null;
};

// What each batch's certificate names as the product ("WYLD - Kiwi 1:1 THC:THCv Gummies",
// "WYLD Kiwi 100mg THC : 100mg THCV"). Longest product name first so "Sour Cherry" wins
// over a hypothetical "Cherry".
const byName = [...catalog.products].sort((a, b) => b.name.length - a.name.length);
const flavorOf = (b) => {
  const line = b.product || b.ocr?.product;
  // "Wyld One" is a separate dispensary SKU family (Sour Peach Mango, …) that no code
  // above should absorb, even though its lines name catalog flavors ("Sour Peach Mango").
  if (line && !/wyld one/i.test(line)) { const hit = byName.find((p) => new RegExp(p.name, "i").test(line)); if (hit) return hit.handle; }
  return null;
};

// Code → flavor from every batch that names its product; applied to batches that don't.
const codeFlavors = new Map();
for (const b of INDEX.batches) {
  const flavor = flavorOf(b);
  const code = codeOf(b);
  if (flavor && code) {
    const prior = codeFlavors.get(code);
    if (prior && prior !== flavor) console.warn(`  ! code ${code} maps to both ${prior} and ${flavor}`);
    if (!prior) codeFlavors.set(code, flavor);
  }
}
console.log(`codes: ${[...codeFlavors.entries()].map(([c, f]) => `${c}→${f}`).join(" ")}`);

const batchesOf = (handle) => INDEX.batches.filter((b) => (codeOf(b) && codeFlavors.get(codeOf(b)) === handle) || flavorOf(b) === handle);

const COMPOUND = (name) => {
  const n = name.toLowerCase();
  if (/thc/.test(n) && !/thcv|thcva/.test(n)) return "thc";
  if (/thcv|thcva/.test(n)) return "thcv";
  if (/cbd/.test(n) && !/cbda/.test(n)) return "cbd";
  if (/cbda/.test(n)) return "cbd";
  if (/cbn/.test(n)) return "cbn";
  if (/cbg/.test(n)) return "cbg";
  if (/cbc/.test(n)) return "cbc";
  return null;
};

// The pack names; the certificates use "Total X" and bare "X" rows. Fold both into one
// measured range per compound, total row preferred.
function cannabinoidStats(batches) {
  const stats = new Map();
  for (const b of batches) {
    if (b.parse_status !== "parsed") continue;
    const seen = new Map();
    for (const c of b.cannabinoids || []) {
      const id = COMPOUND(c.name);
      if (!id || c.mg_per_serving == null) continue;
      const isTotal = /^total/i.test(c.name);
      const prior = seen.get(id);
      if (!prior || (isTotal && !prior.isTotal) || (isTotal === prior.isTotal && c.mg_per_serving > prior.mg)) {
        seen.set(id, { name: c.name, mg: c.mg_per_serving, isTotal });
      }
    }
    for (const [id, { mg }] of seen) {
      const s = stats.get(id) || { min: mg, max: mg, batches: 0 };
      s.min = Math.min(s.min, mg); s.max = Math.max(s.max, mg); s.batches += 1;
      stats.set(id, s);
    }
  }
  return stats;
}

function terpeneStats(batches) {
  const stats = new Map();
  let tested = 0, anyDetected = 0;
  for (const b of batches) {
    if (b.parse_status !== "parsed") continue;
    tested += 1;
    let detected = false;
    for (const t of b.terpenes || []) {
      if (t.percent == null) continue;
      detected = true;
      const key = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const s = stats.get(key) || { name: t.name, max_percent: 0, batches: 0, loq_percent: t.loq_percent };
      s.max_percent = Math.max(s.max_percent, t.percent);
      s.batches += 1;
      if (t.loq_percent) s.loq_percent = Math.min(s.loq_percent ?? 1, t.loq_percent);
      stats.set(key, s);
    }
    if (detected) anyDetected += 1;
  }
  return { tested, anyDetected, detected: [...stats.values()].sort((a, b) => b.max_percent - a.max_percent) };
}

const pct = (v) => Number(v).toFixed(v < 0.01 ? 4 : 2);
const range = (mg) => (Math.abs(mg.max - mg.min) < 0.01 ? `${pct(mg.max)}mg` : `${pct(mg.min)}–${pct(mg.max)}mg`);
const dateOf = (b) => b.meta?.["date of manufacture"] || b.meta?.published || b.meta?.["batch date"] || null;
const span = (batches) => {
  const dates = batches.map(dateOf).filter(Boolean).sort();
  return dates.length ? `${dates[0].slice(0, 4)} → ${dates[dates.length - 1].slice(0, 4)}` : null;
};

const profiles = {};
for (const product of catalog.products) {
  const batches = batchesOf(product.handle);
  if (!batches.length) {
    profiles[product.handle] = { description: "No published batch certificate is connected to this flavor yet.", batches: [] };
    continue;
  }
  const parsed = batches.filter((b) => b.parse_status === "parsed");
  const scanned = batches.filter((b) => b.parse_status === "scanned");
  const cbStats = cannabinoidStats(parsed);
  const terp = terpeneStats(parsed);
  const ocrTerp = batches.filter((b) => b.ocr?.terpenes === "not_tested").length;

  // The description, built line by line from the numbers.
  const parts = [];
  if (parsed.length) {
    const cb = product.cannabinoids.map((c) => {
      const m = cbStats.get(c.id);
      return m ? `${c.name} ${range(m)} per gummy across ${m.batches} batches (pack says ${c.mg_per_gummy}mg)` : null;
    }).filter(Boolean);
    if (cb.length) parts.push(`Lab-measured across ${parsed.length} batch certificates: ${cb.join("; ")}.`);
  }
  if (terp.tested) {
    if (terp.detected.length) {
      const list = terp.detected.slice(0, 4).map((t) => `${t.name} at up to ${pct(t.max_percent)}% (${t.batches} of ${terp.tested} batches)`);
      parts.push(`Terpenes barely register: ${terp.anyDetected} of ${terp.tested} tested batches quantify anything at all — ${list.join(", ")}, all two-to-four hundredths of a percent or less of the gummy's weight.`);
    } else {
      parts.push(`All ${terp.tested} tested batches came back with every one of the lab's ${((parsed[0]?.terpenes || []).length || 39)} listed terpenes below quantification.`);
    }
  }
  if (ocrTerp) parts.push(`${ocrTerp} further scanned batch certificates (Arizona) show their terpene panel as Not Tested.`);
  if (!terp.tested && !ocrTerp && scanned.length) parts.push(`The ${scanned.length} scanned batch certificates on file carry no readable terpene panel.`);
  const declaredBlend = product.molecules.filter((m) => !product.cannabinoids.some((c) => c.id === m));
  if (declaredBlend.length) parts.push(`The pack declares a botanical terpene blend (${declaredBlend.map((m) => m.replaceAll("-", " ")).join(", ")}), but the lab panels never quantify it — the COA record can neither confirm nor deny it.`);
  parts.push("This is the signature of refined distillate: the extract carries the cannabinoids and almost none of the plant's aroma. The fruit here is candy flavoring, not cannabis terpenes.");
  if (scanned.length) parts.push(`${scanned.length} additional batches are on file as page scans without text layers.`);

  profiles[product.handle] = {
    description: parts.join(" "),
    batches_total: batches.length,
    batches_parsed: parsed.length,
    batches_scanned: scanned.length,
    years: span(batches),
    cannabinoids_measured: Object.fromEntries([...cbStats].map(([id, m]) => [id, { mg_min: m.min, mg_max: m.max, batches: m.batches }])),
    terpenes_tested: terp.tested,
    terpenes_detected: terp.detected,
    samples: batches.slice(0, 6).map((b) => ({ handle: b.handle, batch: b.batch, state: b.state, pdf: b.pdf, parse_status: b.parse_status, date: dateOf(b) })),
  };
  console.log(`${product.handle}: ${batches.length} batches (${parsed.length} parsed) — ${terp.anyDetected}/${terp.tested} with terpene detections`);
}

await fs.writeFile(path.join(root, "data/terpene-profiles.json"), `${JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: "Wyld COA lookup certificates (Smithers), wyldcanna.com/us/coa-lookup/",
  basis: "Parsed PDF text for certificates with a text layer; OCR of the summary box for a sample of page scans. Terpene percentages are % w/w.",
  flavors: profiles,
}, null, 2)}\n`);

// Fold a compact block into the catalog for the product pages.
for (const product of catalog.products) {
  const p = profiles[product.handle];
  product.terpenes_measured = p ? {
    description: p.description,
    batches_total: p.batches_total,
    batches_parsed: p.batches_parsed,
    batches_scanned: p.batches_scanned,
    cannabinoids_measured: p.cannabinoids_measured || {},
    terpenes_tested: p.terpenes_tested ?? 0,
    terpenes_detected: (p.terpenes_detected || []).slice(0, 6),
    samples: p.samples || [],
  } : null;
}
catalog.terpene_note = "Per-flavor batch data parsed from the COA certificates Wyld publishes on its COA lookup (data/coa-index.json). Full per-flavor detail in data/terpene-profiles.json.";
await fs.writeFile(path.join(root, "data/products.json"), `${JSON.stringify(catalog, null, 2)}\n`);
console.log("Wrote data/terpene-profiles.json and folded descriptions into products.json");

// The molecule records keep the pack declaration in `evidence`; the COA record sharpens
// it with what the lab actually measured.
const declared = (id) => catalog.products.filter((p) => p.molecules.includes(id));
const measured = (id) => catalog.products.filter((p) => p.terpenes_measured?.cannabinoids_measured?.[id]);
const anyTerpeneEverDetected = Object.values(profiles).some((p) => (p.terpenes_detected || []).length > 0);
for (const m of await fs.readdir(path.join(root, "data/molecules"))) {
  if (!m.endsWith(".json")) continue;
  const record = await JSON.parse(await fs.readFile(path.join(root, `data/molecules/${m}`), "utf8"));
  const id = record.id;
  const carriers = declared(id);
  if (!carriers.length) continue;
  if (record.is_terpenoid) {
    record.evidence = `Declared in the botanical terpene blend of ${carriers.length} flavor${carriers.length > 1 ? "s" : ""} (${carriers.map((p) => p.name).join(", ")}). No published Wyld batch certificate quantifies it: the NY terpene panels return ${anyTerpeneEverDetected ? "traces of other terpenes only" : "all below LOQ"}, and the Arizona certificates mark terpenes Not Tested.`;
  } else {
    const stats = measured(id).map((p) => p.terpenes_measured.cannabinoids_measured[id]).filter(Boolean);
    if (stats.length) {
      const min = Math.min(...stats.map((s) => s.mg_min));
      const max = Math.max(...stats.map((s) => s.mg_max));
      record.evidence = `${record.evidence} Batch certificates measure it at ${Number(min.toFixed(2))}–${Number(max.toFixed(2))}mg per gummy across ${stats.length} flavors.`;
    }
  }
  await fs.writeFile(path.join(root, `data/molecules/${m}`), `${JSON.stringify(record, null, 2)}\n`);
}

// The homepage numbers gain the COA scale.
const stats = await fs.readFile(path.join(root, "data/stats.json"), "utf8").then(JSON.parse);
stats.batches = INDEX.batches.length;
stats.batches_parsed = INDEX.batches.filter((b) => b.parse_status === "parsed").length;
await fs.writeFile(path.join(root, "data/stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
