#!/usr/bin/env node
// Builds everything the catalog renders from data/products.json and data/molecules/:
// data/molecule-products.json (molecule → products reverse index), data/claims/<tag>.json
// (one record per effect tag Wyld puts on the pack, with the research behind each
// cannabinoid that carries it) and data/stats.json (the homepage numbers). Read-only
// toward the records the fetch scripts own; safe to rerun at any time.
import fs from "node:fs/promises";
import path from "node:path";
import { grade } from "./lib/evidence.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, p), "utf8"));
const catalog = await read("data/products.json");
const molecules = [];
for (const f of await fs.readdir(path.join(root, "data/molecules"))) if (f.endsWith(".json")) molecules.push(await read(`data/molecules/${f}`));
const LEVELS = ["human_trials", "human_observational", "animal", "in_vitro", "review_only", "none_found"];

// One-line identity notes for the cannabinoids, written once — the research record is
// computed, this is only the framing a reader needs first.
const IDENTITY = {
  thc: "The primary intoxicating cannabinoid in cannabis, and the common denominator of every WYLD gummy.",
  cbd: "A non-intoxicating cannabinoid, dosed here alongside and sometimes above THC.",
  cbn: "A mildly intoxicating oxidation product of THC, used on packs promising rest.",
  cbg: "The biosynthetic parent of THC and CBD, dosed as a minor partner in two flavors.",
  cbc: "A non-intoxicating cannabinoid from the same biosynthetic branch as CBD and THC.",
  thcv: "A shorter-chain analog of THC, dosed 1:1 with it in the Energy flavor.",
};

// Pack effect tag → what it means in the pack's own words, and which research areas the
// tag draws on. Definitions lean on the copy WYLD publishes; the research is computed.
const VOCABULARY = {
  Mellow: { definition: "An easygoing, mellow unwind — the pack calls it reducing the noise.", areas: ["anxiety", "sleep", "mood"], sense: "relaxing" },
  Sleep: { definition: "Unwind into a good night's rest; THC paired with CBN.", areas: ["sleep"], sense: "relaxing" },
  Dream: { definition: "A deeper rest: 1:1:1 THC, CBD and CBN to soothe body and mind.", areas: ["sleep"], sense: "relaxing" },
  Chill: { definition: "A double dose of CBD over THC — carefree enjoyment of mundane tasks.", areas: ["anxiety", "mood"], sense: "relaxing" },
  Calm: { definition: "The relaxing effects of CBD with a gentle 1mg dose of THC.", areas: ["anxiety", "sleep"], sense: "relaxing" },
  Active: { definition: "A vibrant, uplifting head high for enhancing moments.", areas: ["mood", "cognition"], sense: "uplifting" },
  Playful: { definition: "Laughter the day away — the social, giggly side of THC.", areas: ["mood", "anxiety"], sense: "uplifting" },
  Energy: { definition: "A boost of energy and focus laid over the usual THC high.", areas: ["cognition", "mood"], sense: "uplifting" },
  Bliss: { definition: "Inspired and energetic — a creative boost, or prep for a dance party.", areas: ["mood", "cognition"], sense: "uplifting" },
  Revive: { definition: "A clear-headed, energizing high that balances body and mind.", areas: ["mood", "pain", "anti-inflammatory"], sense: "balanced" },
  Refresh: { definition: "Whole-body recovery with equal parts THC and CBG.", areas: ["pain", "anti-inflammatory"], sense: "balanced" },
  Restore: { definition: "Equilibrium and a sense of balance from 1:1 THC:CBD.", areas: ["pain", "anti-inflammatory", "anxiety"], sense: "balanced" },
};

// Trial conditions that speak to each research area.
const AREA_TRIAL_TERMS = {
  cognition: /cogniti|memory|attention|focus|alert/i, mood: /mood|depress|wellbeing|affect/i,
  anxiety: /anxi|stress|calm|relax/i, sleep: /sleep|insomnia|sedat/i, pain: /pain|analges|nocicept|discomfort/i,
  "anti-inflammatory": /inflamm|arthritis|colitis/i, epilepsy: /epilep|seizure/i, nausea: /nausea|vomit|appetite|cachex/i,
};

const doseLine = (c) => c.cannabinoids.map((x) => `${x.mg_per_gummy}mg ${x.name}`).join(":");

// --- molecule → products reverse index ---
const moleculeProducts = {};
for (const product of catalog.products) {
  for (const id of product.molecules) {
    (moleculeProducts[id] ||= []).push({
      handle: product.handle,
      product: product.name,
      strain: product.strain,
      mood: product.mood,
      claims: product.mood ? [product.mood] : [],
      mg: product.cannabinoids.find((c) => c.id === id)?.mg_per_gummy ?? null,
      dose: product.per_gummy,
      of: product.molecules.length,
      rank: product.molecules.indexOf(id) + 1,
    });
  }
}
await fs.writeFile(path.join(root, "data/molecule-products.json"), `${JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  basis: "Pack-declared cannabinoid doses and terpene blends; mg is milligrams per gummy.",
  molecules: moleculeProducts,
}, null, 2)}\n`);

// --- one record per effect tag ---
await fs.mkdir(path.join(root, "data/claims"), { recursive: true });
for (const [tile, spec] of Object.entries(VOCABULARY)) {
  if (!spec) continue;
  const backing = [];
  for (const m of molecules) {
    const claims = (m.research?.claims || []).filter((c) => spec.areas.includes(c.id));
    if (!claims.length) continue;
    const lines = claims.flatMap((c) => c.evidence_lines || []);
    const g = grade(lines);
    backing.push({
      id: m.id, name: m.name, papers: claims.reduce((n, c) => n + c.papers, 0),
      areas: claims.map((c) => c.label), evidence_level: g.evidence_level, eco: g.eco?.id || null, oxford: g.oxford?.level || null,
      evidence_lines: lines.map(({ design, papers }) => ({ design, papers })),
      products: (moleculeProducts[m.id] || []).map((p) => ({ handle: p.handle, name: p.product, mg: p.mg, dose: p.dose })),
      pmids: claims.flatMap((c) => c.pmids || []).slice(0, 10),
    });
  }
  // Rank by pack dose times literature, with a bonus for human evidence — the same
  // logic as the MONDAYS catalog: a trace compound with a big literature should not
  // outrank the cannabinoid the gummy is actually dosed with.
  const dose = (b) => Math.max(0, ...b.products.map((p) => p.mg || 0));
  const humanBonus = (b) => (b.evidence_level === "human_trials" ? 2 : b.evidence_level === "human_observational" ? 1.5 : 1);
  for (const b of backing) b.score = Number((Math.log1p(dose(b)) * Math.log1p(b.papers) * humanBonus(b)).toFixed(3));
  backing.sort((a, b) => b.score - a.score);
  const trials = [];
  const seen = new Set();
  for (const m of molecules) for (const t of m.trials?.studies || []) {
    if (seen.has(t.nct_id)) continue;
    if (spec.areas.some((a) => AREA_TRIAL_TERMS[a]?.test([t.title, ...t.conditions].join(" ")))) { seen.add(t.nct_id); trials.push({ ...t, molecule: m.name, molecule_id: m.id }); }
  }
  const products = catalog.products.filter((p) => p.mood === tile)
    .map((p) => ({ handle: p.handle, name: p.name, strain: p.strain, dose: p.per_gummy, great_for: p.great_for }));
  const rec = {
    tile, id: tile.toLowerCase(), definition: spec.definition, areas: spec.areas, sense: spec.sense,
    molecules: backing, molecules_with_research: backing.length,
    papers: backing.reduce((n, b) => n + b.papers, 0),
    best_evidence: backing.map((b) => b.evidence_level).sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b))[0] || "none_found",
    best_oxford: backing.map((b) => b.oxford).filter(Boolean).sort()[0] || null,
    trials, products,
  };
  // Rebuilding must not throw away a written summary.
  const file = path.join(root, `data/claims/${rec.id}.json`);
  const existing = await fs.readFile(file, "utf8").then(JSON.parse).catch(() => ({}));
  if (existing.summary) rec.summary = existing.summary;
  await fs.writeFile(file, `${JSON.stringify(rec, null, 2)}\n`);
  console.log(`${rec.tile}: ${rec.molecules_with_research} molecules, ${rec.papers} papers, best ${rec.best_evidence}, ${rec.trials.length} trials, ${rec.products.length} products`);
}

// --- homepage numbers ---
const cannabinoids = molecules.filter((m) => !m.is_terpenoid);
const terpenes = molecules.filter((m) => m.is_terpenoid);
const organismCount = new Set(molecules.flatMap((m) => (m.occurrence?.organisms || []).map((o) => o.name))).size;
const trialIds = new Set(molecules.flatMap((m) => (m.trials?.studies || []).map((t) => t.nct_id)));
const papers = molecules.reduce((n, m) => n + (m.research?.total || 0), 0);
const human = molecules.reduce((n, m) => n + (m.research?.designs?.human || 0) + (m.research?.designs?.clinical_trial || 0) + (m.research?.designs?.human_observational || 0) + (m.research?.designs?.rct || 0), 0);

// Keep each cannabinoid record's `evidence` line derived from the catalog, not hand-typed.
for (const m of cannabinoids) {
  const carriers = catalog.products.filter((p) => p.molecules.includes(m.id));
  const doses = [...new Set(carriers.map((p) => p.cannabinoids.find((c) => c.id === m.id)?.mg_per_gummy).filter(Boolean))].sort((a, b) => a - b);
  m.evidence = `Declared on ${carriers.length} of ${catalog.products.length} WYLD flavors`
    + `${doses.length ? ` at ${doses.length > 2 ? `${doses.slice(0, -1).join(", ")} and ${doses.at(-1)}` : doses.join(" and ")}mg per gummy` : ""}.`;
  m.summary ||= IDENTITY[m.id] || null;
  await fs.writeFile(path.join(root, `data/molecules/${m.id}.json`), `${JSON.stringify(m, null, 2)}\n`);
}

await fs.writeFile(path.join(root, "data/stats.json"), `${JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  products: catalog.products.length,
  cannabinoids: cannabinoids.length,
  terpenes: terpenes.length,
  compounds: molecules.length,
  organisms: organismCount,
  papers,
  human_papers: human,
  trials: trialIds.size,
}, null, 2)}\n`);
console.log({ products: catalog.products.length, compounds: molecules.length, organisms: organismCount, papers, trials: trialIds.size });
