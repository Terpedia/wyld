# WYLD × Terpedia

Static product catalog for the WYLD flavor lineup at [wyld.terpedia.com](https://wyld.terpedia.com). Same pattern as the [MONDAYS catalog](../mondays): no server, no database, no build step — query routes render shared templates. `/?product=elderberry`, `/?c=cbd`, `/?claim=sleep`.

Data comes from the public [wyldcanna.com](https://www.wyldcanna.com/) product pages. The two catalogs differ in one important way: MONDAYS publishes laboratory-measured terpene profiles per chew, while WYLD's pages declare cannabinoid doses on the pack (per gummy and per container) with no analytical profile. So every record here is `"molecules_basis": "declared"` — pack statements, not measurements — and the pages say so.

## Local preview

Because the page loads `data/products.json`, serve the directory over HTTP:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` from this directory.

## The catalog

`scripts/fetch-products.mjs` snapshots the flavor index and every product page into `data/products.json`: effect tag and its brand color, strain language (Indica/Sativa/Hybrid enhanced, with ratios like "2:1 CBN"), cannabinoid doses, "Great For" copy, ingredients (including the botanical terpene blends Kiwi and Prickly Pear declare), nutrition panel, the states each flavor is sold in, and the pack shot.

```bash
node scripts/fetch-products.mjs
```

## Molecule records

`data/molecules/<id>.json` carries identity, protein assay results, literature and registered trials for every compound a pack declares: the six cannabinoids (THC, CBD, CBN, CBG, CBC, THCv) plus the five botanical terpenes shared with the MONDAYS catalog (limonene, α-pinene, β-pinene, valencene, β-caryophyllene — records copied from `../mondays/data/molecules/`, where the same pipeline maintains them).

```bash
node scripts/fetch-molecule-data.mjs            # all of them
node scripts/fetch-molecule-data.mjs thc        # or named ids
```

Sources are PubChem (identity, description, structure image, assay summary), UniProt and NCBI Protein (target names), PubMed (literature and MeSH-counted research areas), and ClinicalTrials.gov. Only assays PubChem marks **Active** against a *named* protein are kept, most potent measurement per target.

## Claims, indexes, stats

```bash
node scripts/build.mjs
```

Builds three things from the catalog and the molecule records:

- `data/claims/<tag>.json` — one record per effect tag the pack carries (Mellow, Sleep, Dream, Energy, Revive, …): what the pack means by it, every declared compound with literature in those research areas (graded on Oxford CEBM from ECO/MeSH indexing), the registered trials in the area, and the flavors carrying the tag.
- `data/molecule-products.json` — the molecule → flavors reverse index.
- `data/stats.json` — the homepage numbers, computed not typed.

The LLM-written consumer summaries the MONDAYS catalog carries (`consumer_summary` fields) are a separate pipeline not yet ported here; the pages render fine without them and every count on screen is computed from the fetched records.

## Batch certificates and terpenes

Every Wyld box prints a batch number that resolves on the [COA lookup](https://www.wyldcanna.com/us/coa-lookup/) to a lab certificate (Smithers). Wyld publishes a sitemap of all of them (`coa-result-sitemap*.xml`) — 1,044 batches at the snapshot.

```bash
node scripts/fetch-coas.mjs               # index every batch page → data/coa-index.json
node scripts/fetch-coas.mjs --pdfs ny     # download + parse PDFs for a state
node scripts/fetch-coas.mjs --reparse     # re-extract PDFs already on disk
node scripts/ocr-coas.mjs                 # OCR the summary box of scanned certificates
node scripts/build-terpenes.mjs           # per-flavor stats + descriptions
```

The newer NY certificates carry a text layer and parse exactly (cannabinoids with mg/serving, a 39-analyte terpene panel); the 2024 AZ/NJ ones are page scans with no text layer — `ocr-coas.mjs` reads their summary box with tesseract, and they stay `scanned` in the index. PDFs are cached in `/tmp/wyld-coas`, not committed.

What the record says about terpenes: the extract is refined distillate. NY batches run the full panel and almost everything is below quantification — a few hundredths of a percent at most (Limonene 0.026%, caryophyllene oxide 0.039% in the highest batches); the AZ certificates mark terpenes Not Tested outright. The botanical terpene blends Kiwi and Prickly Pear declare on the pack are never quantified by a lab panel. The per-flavor description on each product page is generated from these counts by `build-terpenes.mjs`; full per-batch data lives in `data/coa-index.json` and `data/terpene-profiles.json`.

## Deployment

- GitHub Pages: enable Pages for the repository and select **GitHub Actions**; the CNAME is `wyld.terpedia.com`.
- Cloudflare Pages: connect the repository with the root directory set to `wyld` if the monorepo is deployed, or deploy this directory as the project root.

## Data policy

`data/products.json` is a dated snapshot of the public wyldcanna.com catalog. Cannabinoid amounts are pack declarations; the batch CoAs linked from Wyld's COA lookup are cannabinoid/safety panels obtained per batch number, not a published terpene or potency profile per SKU. Nothing on the site is medical advice, and THC products are sold only through licensed dispensaries in the states listed on each flavor.
