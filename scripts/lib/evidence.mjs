// The evidence vocabulary, on published standards rather than a home-made scale.
//
//   type of evidence  -> ECO, the Evidence & Conclusion Ontology (what GO and UniProt use)
//   study design      -> MeSH Publication Types, as PubMed tags every record
//   strength          -> Oxford CEBM 2009 levels, the grading readers and regulators know
//   structure         -> SEPIO: an assertion rests on evidence lines, each made of items
//
// Everything here is a function of PubMed's own indexing. Nothing is judged by a model.

export const ECO = {
  clinical: { id: "ECO:0000180", label: "clinical study evidence" },
  in_vivo: { id: "ECO:0000178", label: "in vivo assay evidence" },
  animal_model: { id: "ECO:0007120", label: "animal model system study evidence" },
  in_vitro: { id: "ECO:0000181", label: "in vitro assay evidence" },
  traceable_author: { id: "ECO:0000033", label: "author statement supported by traceable reference" },
  curator: { id: "ECO:0000205", label: "curator inference" },
  combinatorial: { id: "ECO:0000212", label: "combinatorial evidence" },
};

// MeSH publication types that decide a study's design. Order matters: the first match wins.
const PUBTYPE_DESIGN = [
  [/Meta-Analysis|Systematic Review/, "systematic_review"],
  [/Randomized Controlled Trial/, "rct"],
  [/Clinical Trial|Controlled Clinical Trial|Pragmatic Clinical Trial/, "clinical_trial"],
  [/Observational Study|Comparative Study|Case Reports|Case-Control|Cohort/, "human_observational"],
  [/^Review$|Scoping Review/, "review"],
];

/** Classify one PubMed record from its publication types and MeSH headings. */
export function designOf({ types = [], mesh = new Set() }) {
  for (const [pattern, design] of PUBTYPE_DESIGN) if (types.some((t) => pattern.test(t))) return design;
  if (mesh.has("Humans")) return "human_observational";
  if (mesh.has("Animals")) return "animal";
  if (["In Vitro Techniques", "Cell Line", "Cell Line, Tumor", "Cells, Cultured", "Microbial Sensitivity Tests"].some((t) => mesh.has(t))) return "in_vitro";
  return "other";
}

/** One evidence line per design, SEPIO-style: the ECO type, the MeSH basis, the items. */
export function evidenceLines(papers) {
  const lines = new Map();
  for (const paper of papers) {
    const design = designOf(paper);
    if (design === "other") continue;
    const line = lines.get(design) || { design, ...evidenceTypeFor(design), papers: 0, pmids: [] };
    line.papers += 1;
    if (line.pmids.length < 12) line.pmids.push(paper.pmid);
    lines.set(design, line);
  }
  const order = ["systematic_review", "rct", "clinical_trial", "human_observational", "animal", "in_vitro", "review"];
  return order.filter((d) => lines.has(d)).map((d) => lines.get(d));
}

function evidenceTypeFor(design) {
  switch (design) {
    case "systematic_review": return { eco: ECO.traceable_author, mesh_publication_types: ["Meta-Analysis", "Systematic Review"] };
    case "rct": return { eco: ECO.clinical, mesh_publication_types: ["Randomized Controlled Trial"] };
    case "clinical_trial": return { eco: ECO.clinical, mesh_publication_types: ["Clinical Trial"] };
    case "human_observational": return { eco: ECO.clinical, mesh_publication_types: ["Observational Study"] };
    case "animal": return { eco: ECO.animal_model, mesh_publication_types: [] };
    case "in_vitro": return { eco: ECO.in_vitro, mesh_publication_types: [] };
    case "review": return { eco: ECO.traceable_author, mesh_publication_types: ["Review"] };
    default: return { eco: ECO.curator, mesh_publication_types: [] };
  }
}

/**
 * Oxford CEBM 2009 level for a therapy-type question, from which designs are present.
 * Bench and animal work is level 5 ("based on physiology, bench research or first
 * principles") — that is the standard's judgement, not ours, and it is the honest one.
 */
export function oxfordLevel(lines) {
  const has = (d) => lines.some((l) => l.design === d && l.papers > 0);
  if (has("systematic_review") && (has("rct") || has("clinical_trial"))) return { level: "1a", label: "systematic review of randomised trials" };
  if (has("rct")) return { level: "1b", label: "individual randomised trial" };
  if (has("clinical_trial")) return { level: "2b", label: "individual controlled study" };
  if (has("human_observational")) return { level: "2b", label: "individual cohort or observational study" };
  if (has("animal") || has("in_vitro")) return { level: "5", label: "bench or animal research" };
  if (has("review") || has("systematic_review")) return { level: "5", label: "expert review without primary human data" };
  return { level: null, label: "no evidence found" };
}

/** The plain consumer label, derived from the same lines. */
export function consumerLevel(lines) {
  const has = (d) => lines.some((l) => l.design === d && l.papers > 0);
  if (has("rct") || has("clinical_trial") || has("systematic_review")) return "human_trials";
  if (has("human_observational")) return "human_observational";
  if (has("animal")) return "animal";
  if (has("in_vitro")) return "in_vitro";
  if (has("review")) return "review_only";
  return "none_found";
}

/** Everything a graded statement carries. */
export function grade(lines) {
  const strongest = lines[0] || null;
  return {
    evidence_level: consumerLevel(lines),
    eco: strongest?.eco || ECO.curator,
    oxford: oxfordLevel(lines),
    evidence_lines: lines,
  };
}
