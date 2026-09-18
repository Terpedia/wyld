#!/usr/bin/env node
// Snapshot the public WYLD product catalog (wyldcanna.com, a WordPress site) into
// data/products.json: one record per flavor with the effect tag the brand gives it,
// the cannabinoid dose printed on the pack, ingredients, nutrition, the states it is
// sold in, and the pack shot. Wyld publishes no per-batch lab data on these pages, so
// every molecule list is "declared" — what the pack says, not a measurement.
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const BASE = "https://www.wyldcanna.com";
const INDEX = `${BASE}/us/products/`;
const UA = "terpedia-wyld (dan@terpedia.com)";
const OUT = path.join(root, "data/products.json");
const IMAGE_DIR = path.join(root, "data/product-images");

const get = async (url) => {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
};

const text = (html) => html
  .replace(/&#8217;/g, "’").replace(/&#8216;/g, "‘").replace(/&#8220;|&#8221;/g, '"')
  .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(/&#038;|&amp;/g, "&")
  .replace(/&nbsp;/g, " ").replace(/&#8482;/g, "™").replace(/&amp;/g, "&");

// Effect tag → the three shop categories Wyld's own nav uses. Sleep/Dream/Chill/Calm
// round out Relaxing; 1:1 ratios (Revive/Refresh/Restore) sit in Balanced.
const CATEGORY = {
  Mellow: "Relaxing", Sleep: "Relaxing", Dream: "Relaxing", Chill: "Relaxing", Calm: "Relaxing",
  Active: "Uplifting", Energy: "Uplifting", Bliss: "Uplifting", Playful: "Uplifting",
  Revive: "Balanced", Refresh: "Balanced", Restore: "Balanced",
};

// Cannabinoids named on the packs, with the molecule id the records in data/molecules/ use.
const CANNABINOID_IDS = {
  thc: "thc", cbd: "cbd", cbn: "cbn", cbg: "cbg", cbc: "cbc", thcv: "thcv",
};
// Botanical terpenes some packs declare in the ingredients ("Terpenes (Limonene, …)")
// or call out in the copy. Keyed by the name with spaces and hyphens removed.
const TERPENE_IDS = {
  limonene: { name: "Limonene", id: "limonene" },
  alphapinene: { name: "α-Pinene", id: "alpha-pinene" },
  betapinene: { name: "β-Pinene", id: "beta-pinene" },
  valencene: { name: "Valencene", id: "valencene" },
  betacaryophyllene: { name: "β-Caryophyllene", id: "beta-caryophyllene" },
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The info sections ("Great For", "Nutrition Facts", "Ingredients", "Region") are
// toggled <div class="section">…<span>TITLE</span>…<div class="section-body">… blocks.
// Bodies hold nested divs, so each body runs to wherever the next section begins.
function sections(html) {
  const marks = [...html.matchAll(/<div class="section[^"]*">\s*<div class="section-title">\s*<span>([^<]+)<\/span>/g)];
  return new Map(marks.map((m, i) => [m[1].trim(), html.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined)]));
}

function parsePage(handle, html) {
  const h1 = html.match(/<h1>([^<]+)<\/h1>/)?.[1] || "";
  // og:description appears twice: the SEO meta first, the catalog description second.
  const ogDescriptions = [...html.matchAll(/property="og:description" content="([^"]*)"/g)].map((m) => text(m[1]));

  // og:image comes sized (-997x1024) and cropped (-1200x630); keep the sized pack shot,
  // falling back to the full-size original only if no sized variant is offered.
  const ogImages = [...html.matchAll(/property="og:image" content="([^"]*)"/g)].map((m) => m[1]);
  const image = ogImages.find((u) => !/1200x630/.test(u)) || ogImages[0]?.replace(/-\d+x\d+(?=\.\w+$)/, "") || null;

  const mood = html.match(/<div class="mood[^"]*"[^>]*>([^<]+)<\/div>/)?.[1]?.trim() || null;
  const moodColor = html.match(/<div class="mood[^"]*" style="background-color: ([^;]+);">/)?.[1]?.trim() || null;
  const full = [...html.matchAll(/<div class="heading in-view-enabled">([^<]+)<\/div>/g)].map((m) => text(m[1].trim()))
    .find((t) => t && !/you might also like/i.test(t)) || null;
  const subHeading = html.match(/<div class="sub-heading[^"]*">([^<]+)<\/div>/)?.[1]?.trim() || null;

  const doses = [...html.matchAll(/<div class="dose"><span>([^<]+)<\/span><\/div>/g)].map((m) => text(m[1]).trim());
  const perGummy = doses.find((d) => /per gummy/i.test(d)) || null;
  const perContainer = doses.find((d) => /per (container|package)/i.test(d)) || null;
  const count = Number(doses.find((d) => /gummies per/i.test(d))?.match(/(\d+)/)?.[1]) || null;

  // "10mg THC:10mg CBN per gummy" / "20mg CBD:1mg THC per gummy" → [{name, mg}]
  const cannabinoids = [];
  for (const [dose, field] of [[perGummy, "mg_per_gummy"], [perContainer, "mg_per_container"]]) {
    for (const part of (dose || "").replace(/ per (gummy|container|package)/i, "").split(":")) {
      const m = part.trim().match(/^([\d.]+)\s*mg\s*(\w+)$/i);
      if (!m) continue;
      const id = CANNABINOID_IDS[m[2].toLowerCase()];
      if (!id) continue;
      let entry = cannabinoids.find((c) => c.id === id);
      if (!entry) { entry = { name: m[2].toUpperCase().replace("THCV", "THCv"), id }; cannabinoids.push(entry); }
      entry[field] = Number(m[1]);
    }
  }

  // Terpenes the pack declares in the ingredients, plus any named in the copy.
  const found = new Map();
  for (const m of [...html.matchAll(/Terpenes?\s*\(([^)]+)\)/gi), ...html.matchAll(/terpene profile featuring ([^.<]+)/gi)]) {
    for (const raw of m[1].split(/,| and /)) {
      const t = TERPENE_IDS[raw.trim().toLowerCase().replace(/[\s-]+/g, "")];
      if (t) found.set(t.id, t);
    }
  }
  const terpenes = [...found.values()];

  const sectionsMap = sections(html);
  const body = (title) => text((sectionsMap.get(title) || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const greatFor = body("Great For").trim() || null;

  const ingredientsBody = sectionsMap.get("Ingredients") || "";
  const ingredientsPlain = text(ingredientsBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const ingredients = ingredientsPlain.replace(/^.*?Ingredients:\s*/i, "").split(/ Contains:/i)[0].trim();
  const contains = /Contains:\s*([^<]*?)(?:<\/|Region|$)/i.test(ingredientsPlain)
    ? ingredientsPlain.split(/Contains:/i).pop().replace(/\s*Region.*$/i, "").trim() || null
    : null;

  const nutrition = body("Nutrition Facts");
  const serving = nutrition.match(/Serving Size ([^()]+?(?:\(\d+g\))?)\s*Amount/i)?.[1]?.trim() || null;
  const calories = nutrition.match(/Calories\s*(\d+)/i)?.[1] || null;

  const regions = [...html.matchAll(/<div class="region" data-region="[A-Z]{2}">\s*([^<]+?)\s*<\/div>/g)].map((m) => text(m[1]));

  const description = ogDescriptions[1] || ogDescriptions[0] || "";

  // "Marionberry Indica Enhanced Gummies" / "Elderberry 2:1 CBN + Indica Enhanced Gummies"
  const strain = full?.match(/\b(Indica|Sativa|Hybrid)\s+Enhanced/)?.[1] || null;
  const ratio = full?.match(/\b(\d+:\d+(?::\d+)?)\b/)?.[1] || null;
  const name = full
    ? full.replace(/\s*(?:(?:\d+:\d+(?::\d+)?\s*)?(?:(?:THCv|THC|CBD|CBN|CBG|CBC)(?::(?:THCv|THC|CBD|CBN|CBG|CBC))*\s*\+?\s*)?)?(?:Indica|Sativa|Hybrid)\s+Enhanced\s+Gummies\s*$/i, "").replace(/\s*\+\s*$/i, "").replace(/\s+Gummies\s*$/i, "").trim()
    : h1.replace(/^(?:LIMITED TIME!\s*)?Wyld\s+/i, "").replace(/\s+Cannabis[- ]Infused Gummies.*$/i, "").trim();

  return {
    name,
    handle,
    mood,
    mood_color: moodColor,
    category: CATEGORY[mood] || null,
    strain: strain ? `${strain} Enhanced` : null,
    ratio,
    format: subHeading,
    full_name: full,
    description,
    cannabinoids,
    per_gummy: perGummy,
    per_container: perContainer,
    gummies_per_container: count,
    great_for: greatFor,
    serving_size: serving,
    calories: calories ? Number(calories) : null,
    ingredients: ingredients || null,
    contains: contains || null,
    regions,
    molecules: [...cannabinoids.map((c) => c.id), ...terpenes.map((t) => t.id)],
    molecules_basis: "declared",
    image: image ? { source: image, src: `data/product-images/${handle}${path.extname(new URL(image).pathname)}`, alt: `${full || name} pack shot` } : null,
    source: `${BASE}/us/products/${handle}/`,
  };
}

async function download(handle, url, ext) {
  try {
    const r = await get(url);
    await fs.mkdir(IMAGE_DIR, { recursive: true });
    await fs.writeFile(path.join(IMAGE_DIR, `${handle}${ext}`), Buffer.from(await r.arrayBuffer()));
    return true;
  } catch (e) {
    console.warn(`  ! image ${handle}: ${e.message}`);
    return false;
  }
}

// The catalog index lists every live flavor; fetch it first so new products are picked up.
const indexHtml = await (await get(INDEX)).text();
const handles = [...new Set([...indexHtml.matchAll(/href="https:\/\/www\.wyldcanna\.com\/us\/products\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))]
  .filter((h) => !["", "us"].includes(h));
console.log(`${handles.length} flavors on the index: ${handles.join(", ")}`);

const products = [];
for (const handle of handles) {
  const html = await (await get(`${BASE}/us/products/${handle}/`)).text();
  const product = parsePage(handle, html);
  if (product.image) await download(handle, product.image.source, path.extname(product.image.src));
  products.push(product);
  console.log(`${handle}: ${product.mood || "?"} · ${product.per_gummy || "no dose"} · ${product.strain || "no strain"} · ${product.regions.length} states · ${product.molecules.join("/")}`);
}
products.sort((a, b) => a.name.localeCompare(b.name));

const catalog = {
  source: BASE + "/",
  snapshot_date: new Date().toISOString().slice(0, 10),
  note: "One record per flavor on the public wyldcanna.com catalog. Cannabinoid amounts are the doses printed on the pack (per gummy and per container); Wyld publishes no per-product analytical profile on these pages, so molecule lists are declared pack facts, not laboratory measurements. Molecule ids resolve to records in data/molecules/. Kiwi and Prickly Pear declare a botanical terpene blend on the pack; the effect tag is the brand's own.",
  products,
};
await fs.writeFile(OUT, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
