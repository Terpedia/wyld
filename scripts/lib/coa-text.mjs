// Parses Smithers "COMPLIANCE FOR RETAIL" certificate text (pdftotext -layout) into
// cannabinoid and terpene tables. Shared by fetch-coas.mjs and the batch viewer tests.
// The Smithers NY/NJ certificate format: "Average Cannabinoid Profile" table with
// Analyte / LOQ (%) / Average % (w/w) / mg/serving, then the "Terpene Total" table with
// Analyte / LOQ (%) / Results (%), two analytes per line.
export function parseCoaText(raw) {
  // The product line is printed at the top of the certificate:
  // "Wyld - Pomegranate Gummies - 10mg THC : 10mg CBD - 10ct" / "WYLD Marionberry 100mg THC".
  const product = raw.split("\n").slice(0, 60).map((l) => l.trim()).find((l) => /^wyld/i.test(l)) || null;
  const cannabinoids = [];
  const cannabinoidBlock = raw.slice(raw.indexOf("Average Cannabinoid Profile"), raw.indexOf("Terpene Total") > -1 ? raw.indexOf("Terpene Total") : raw.indexOf("Residual"));
  for (const line of cannabinoidBlock.split("\n")) {
    const m = line.match(/^\s*(.+?)\s+([\d.]+|-)\s+([\d.]+|<LOQ)\s+([\d.]+|<LOQ)\s*$/);
    if (!m) continue;
    cannabinoids.push({ name: m[1].trim(), loq_percent: m[2] === "-" ? null : Number(m[2]), percent: m[3] === "<LOQ" ? null : Number(m[3]), mg_per_serving: m[4] === "<LOQ" ? null : Number(m[4]) });
  }
  const terpenes = [];
  // The analyte table runs from the "Terpene Total" panel heading to the "Terpene Totals"
  // summary row; the earlier page-1 summary box also says "Residual Solvents", so the
  // end boundary must be the totals row, not the next panel.
  const terpStart = raw.search(/Terpene Total/);
  const terpEnd = terpStart > -1 ? raw.indexOf("Terpene Totals", terpStart) : -1;
  const terpBlock = terpStart > -1 && terpEnd > terpStart ? raw.slice(terpStart, terpEnd) : "";
  for (const m of terpBlock.matchAll(/([A-Za-z0-9][A-Za-z0-9().,+\-/'·β ]*?)\s+([\d.]+)\s+(<LOQ|[\d.]+)/g)) {
    const name = m[1].trim();
    if (!/^[A-Za-z0-9]/.test(name) || /^(Analyte|LOQ|Results|Sample|Date|SOP|Analyzed|Analyst|Tested)$/i.test(name)) continue;
    terpenes.push({ name, loq_percent: Number(m[2]), percent: m[3] === "<LOQ" ? null : Number(m[3]) });
  }
  const totals = {};
  for (const m of raw.matchAll(/Total (THC|CBD|Cannabinoids|Terpenes)\D*?([\d.]+)\s*%/gi)) totals[m[1]] = Number(m[2]);
  return { product, cannabinoids, terpenes, totals };
}
