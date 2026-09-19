const TERPEDIA_PORTAL = 'https://terpedia.com/intelligence-portals/cannabis';
// The knowledge base is where molecule science lives; this catalog carries composition.
const KB_MOLECULE = 'https://kb.terpedia.com/entity/';
let products = [];
let activeFilter = 'all';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moleculeUrl = (id) => `?c=${encodeURIComponent(id)}`;
const main = () => document.querySelector('main');
const getJSON = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } };
const back = '<a class="back" href="./">← Back to WYLD catalog</a>';

const LEVEL_LABEL = {human_trials: 'human trials', human_observational: 'human observational', animal: 'animal studies', in_vitro: 'lab studies', review_only: 'reviews', none_found: 'no research yet'};
const evidenceBadge = (level, oxford) => `<span class="ev-badge ev-${esc(level)}">${esc(LEVEL_LABEL[level] || level)}${oxford?.level ? ` · Oxford ${esc(oxford.level)}` : ''}</span>`;
const pct = (v) => Number(v).toFixed(v < 0.01 ? 4 : 2);

const moodBadge = (product, hero) => product.mood
  ? `<span class="mood-badge ${hero ? 'claim-tile--hero' : ''}" style="background:${esc(product.mood_color || 'var(--green)')}">${esc(product.mood)}</span>`
  : '';

const claimLink = (t) => `<a class="claim-tile" href="?claim=${encodeURIComponent(String(t).toLowerCase())}">${esc(t)}</a>`;
const claimTiles = (claims) => claims?.length
  ? `<div class="claims"><div class="claims-label">On the pack</div><div class="claim-tiles">${claims.map(claimLink).join('')}</div></div>`
  : '';

// The effect tag with its receipts: which cannabinoids carry research in the tag's areas,
// graded on Oxford CEBM. The tile is a promise; this is what stands behind it.
const claimBacking = (claim) => claim ? `
  <h2 class="section-h">What backs the “${esc(claim.tile)}” tag</h2>
  <div class="ctable-wrap"><table class="ctable">
    <thead><tr><th>Compound</th><th class="num">Dose</th><th class="num">Papers</th><th>Best evidence</th><th>Oxford</th></tr></thead>
    <tbody>${claim.molecules.map((b) => `
      <tr>
        <td><a href="?c=${encodeURIComponent(b.id)}">${esc(b.name)}</a><br /><span class="fine">${esc(b.areas.join(' · '))}</span></td>
        <td class="num">${b.products.filter((p) => p.mg).map((p) => `${p.mg}mg`).join('–') || '—'}</td>
        <td class="num">${b.pmids?.length ? `<a href="https://pubmed.ncbi.nlm.nih.gov/?term=${b.pmids.join(',')}" target="_blank" rel="noreferrer">${b.papers} ↗</a>` : b.papers}</td>
        <td>${esc(LEVEL_LABEL[b.evidence_level] || b.evidence_level)}${b.eco ? `<br /><span class="fine mono">${esc(b.eco)}</span>` : ''}</td>
        <td class="num">${esc(b.oxford || '—')}</td>
      </tr>`).join('')}</tbody></table></div>
  <p class="fine">Research areas: ${esc(claim.areas.join(', '))}. Counts are papers in the PubMed sample for each compound; evidence type per ECO, strength per Oxford CEBM 2009. Studies test isolated compounds at their own doses — a 10mg gummy is not a trial dose.</p>` : '';

async function renderProduct(handle) {
  const catalog = await getJSON('data/products.json');
  const product = catalog?.products.find((p) => p.handle === handle);
  if (!product) return renderMissing('Flavor', handle);
  const claim = product.mood ? await getJSON(`data/claims/${encodeURIComponent(product.mood.toLowerCase())}.json`) : null;

  main().innerHTML = `
    <section class="entity">
      ${back}
      <p class="eyebrow">${esc(product.category || 'Cannabis gummies')} · ${esc(product.format || 'Real-Fruit Cannabis Infused Gummies')}</p>
      <div class="prod-head">
        ${product.image?.src ? `<img class="prod-image" src="${esc(product.image.src)}" alt="${esc(product.image.alt || product.name)}" width="320" height="${product.image.height && product.image.width ? Math.round(320 * product.image.height / product.image.width) : 262}" onerror="this.remove()" />` : ''}
        <div>
          <h1>${esc(product.name)} Gummies</h1>
          <div class="strain">${esc(product.full_name || '')}</div>
          <p class="hero-copy">${esc(product.description)}</p>
          <div style="margin:14px 0 6px">${moodBadge(product, true)}</div>
          <div class="buy-row">
            <a class="portal-button" href="${esc(product.source)}" target="_blank" rel="noreferrer">View on wyldcanna.com ↗</a>
          </div>
        </div>
      </div>

      <h2 class="section-h">The dose</h2>
      <div class="stat-row">
        ${product.cannabinoids.map((c) => `<div class="stat"><b>${c.mg_per_gummy}mg</b><span>${esc(c.name)} per gummy</span></div>`).join('')}
        <div class="stat"><b>${product.gummies_per_container ?? '—'}</b><span>gummies per container</span></div>
      </div>
      ${product.great_for ? `<p class="measured-line">“Great for ${esc(product.great_for.replace(/^./, (c) => c.toLowerCase()))}” — the pack’s own words.</p>` : ''}
      ${claimTiles(product.mood ? [product.mood] : [])}
      ${claimBacking(claim)}

      <h2 class="section-h">Declared compounds</h2>
      <p class="fine">Ids resolve to full records: chemistry, protein targets, literature and trials. Wyld publishes no per-batch analytical profile on its product pages, so this list is what the pack declares, not a lab measurement.</p>
      <div class="ctable-wrap"><table class="ctable">
        <thead><tr><th>Compound</th><th class="num">mg per gummy</th><th class="num">mg per container</th></tr></thead>
        <tbody>${product.cannabinoids.map((c) => `
          <tr>
            <td><a href="${moleculeUrl(c.id)}">${esc(c.name)}</a></td>
            <td class="num">${c.mg_per_gummy}</td>
            <td class="num">${c.mg_per_container ?? '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      ${product.molecules.some((m) => !product.cannabinoids.some((c) => c.id === m)) ? `
      <p class="fine">Botanical terpene blend declared in the ingredients: ${product.molecules.filter((m) => !product.cannabinoids.some((c) => c.id === m)).map((m) => `<a href="${moleculeUrl(m)}">${esc(m.replaceAll('-', ' '))}</a>`).join(', ')}.</p>` : ''}

      <h2 class="section-h">Terpenes, measured</h2>
      ${product.terpenes_measured ? `
      <p class="hero-copy">${esc(product.terpenes_measured.description)}</p>
      ${Object.keys(product.terpenes_measured.cannabinoids_measured || {}).length ? `
      <div class="ctable-wrap"><table class="ctable">
        <thead><tr><th>Compound</th><th class="num">Declared</th><th class="num">Measured per gummy</th><th class="num">Batches</th></tr></thead>
        <tbody>${product.cannabinoids.map((c) => {
          const m = product.terpenes_measured.cannabinoids_measured[c.id];
          if (!m) return '';
          return `<tr><td>${esc(c.name)}</td><td class="num">${c.mg_per_gummy}mg</td><td class="num">${m.mg_min === m.mg_max ? m.mg_max.toFixed(2) : `${m.mg_min.toFixed(2)}–${m.mg_max.toFixed(2)}`}mg</td><td class="num">${m.batches}</td></tr>`;
        }).join('')}</tbody></table></div>` : ''}
      ${product.terpenes_measured.terpenes_detected?.length ? `
      <p class="fine">Terpenes detected above quantification, and the most any batch showed: ${product.terpenes_measured.terpenes_detected.map((t) => {
        const slug = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `<a href="${moleculeUrl(slug)}">${esc(t.name)}</a> ${pct(t.max_percent)}%`;
      }).join(' · ')}</p>` : ''}
      <p class="fine">${product.terpenes_measured.batches_total} batches on file · ${product.terpenes_measured.batches_parsed} parsed, ${product.terpenes_measured.batches_scanned} scanned${product.terpenes_measured.years ? ` · ${esc(product.terpenes_measured.years)}` : ''}</p>
      ${product.terpenes_measured.samples?.length ? `
      <div class="ctable-wrap"><table class="ctable">
        <thead><tr><th>Batch</th><th>State</th><th>Date</th><th>Certificate</th></tr></thead>
        <tbody>${product.terpenes_measured.samples.map((b) => `
          <tr>
            <td>${esc(b.batch)}</td>
            <td>${esc(b.state)}</td>
            <td class="num">${esc(b.date || '—')}</td>
            <td><a href="${esc(b.pdf)}" target="_blank" rel="noreferrer">${b.parse_status === 'parsed' ? 'COA, parsed' : 'COA, scan'} ↗</a></td>
          </tr>`).join('')}</tbody></table></div>` : ''}` : `
      <p class="fine">No published batch certificate is connected to this flavor yet. Every Wyld batch links its lab report from the <a href="https://www.wyldcanna.com/us/coa-lookup/" target="_blank" rel="noreferrer">COA lookup</a>; the flavor's page fills in as those certificates are parsed.</p>`}

      <h2 class="section-h">Traceability</h2>
      <div class="molecule-panel">
        <span>Ingredients</span><strong>${esc(product.ingredients || 'Not published')}</strong>
        ${product.contains ? `<span>Contains</span><strong>${esc(product.contains)}</strong>` : ''}
        ${product.serving_size ? `<span>Serving</span><strong>${esc(product.serving_size)} · ${product.calories} calories</strong>` : ''}
        <span>Sold in</span><strong>${product.regions.length ? esc(product.regions.join(', ')) : 'See store locator'}</strong>
        <span>Batch CoAs</span><strong><a href="https://www.wyldcanna.com/us/coa-lookup/" target="_blank" rel="noreferrer">Wyld COA lookup by batch number ↗</a></strong>
      </div>
    </section>`;
  return true;
}

function renderMissing(kind, slug) {
  main().innerHTML = `<section class="entity">${back}<p class="eyebrow">${esc(kind)}</p><h1>${esc(slug.replaceAll('-', ' '))}</h1><p class="hero-copy">No record on file for this ${kind.toLowerCase()} in the catalog snapshot.</p></section>`;
  return true;
}

// What the literature holds for a molecule, counted from PubMed indexing — no model
// between the reader and the counts.
const researchTable = (research) => research?.claims?.length ? `
  <h2 class="section-h">What the literature holds</h2>
  <div class="ctable-wrap"><table class="ctable">
    <thead><tr><th>Area</th><th class="num">Papers</th><th>Best evidence</th><th>Oxford</th></tr></thead>
    <tbody>${research.claims.slice(0, 10).map((c) => `
      <tr>
        <td>${esc(c.label)}${c.pmids?.length ? `<br /><span class="fine"><a href="https://pubmed.ncbi.nlm.nih.gov/?term=${c.pmids.join(',')}" target="_blank" rel="noreferrer">sample PMIDs ↗</a></span>` : ''}</td>
        <td class="num">${c.papers}</td>
        <td>${esc(LEVEL_LABEL[c.evidence_level] || c.evidence_level)}${c.eco ? `<br /><span class="fine mono">${esc(c.eco?.id || c.eco)}</span>` : ''}</td>
        <td class="num">${esc(c.oxford?.level || '—')}</td>
      </tr>`).join('')}</tbody></table></div>
  <p class="fine">${esc(research.basis)}</p>
  ${research.designs ? `<p class="fine">Sample of ${research.sampled} of ${Number(research.total).toLocaleString()} records, by design: ${esc(Object.entries(research.designs).map(([d, n]) => `${d} ${n}`).join(' · '))}${research.years ? `, ${research.years.from}–${research.years.to}` : ''}. <a href="${esc(research.search_url)}" target="_blank" rel="noreferrer">Run the search ↗</a></p>` : ''}` : '';

async function renderMolecule(slug) {
  const [molecule, index] = await Promise.all([getJSON(`data/molecules/${encodeURIComponent(slug)}.json`), getJSON('data/molecule-products.json')]);
  if (!molecule) return renderMissing('Molecule', slug);
  const inProducts = index?.molecules[slug] || [];
  const chem = molecule.pubchem;
  const claimTilesFor = [...new Set(inProducts.flatMap((p) => p.claims || []))];

  main().innerHTML = `
    <section class="entity">
      ${back}
      <p class="eyebrow">Cannabinoid${molecule.is_terpenoid ? ' · botanical terpene' : ''}</p>
      <div class="mol-head">
        ${chem?.image ? `<img class="mol-image" src="${esc(chem.image)}" alt="Structure of ${esc(molecule.name)}" width="300" height="300" onerror="this.remove()" />` : ''}
        <div>
          <h1>${esc(molecule.name)}</h1>
          <p class="hero-copy">${esc(molecule.summary || chem?.description || '')}</p>
          ${molecule.evidence ? `<p class="measured-line">${esc(molecule.evidence)}</p>` : ''}
        </div>
      </div>

      ${researchTable(molecule.research)}

      ${molecule.trials?.studies?.length ? `
      <h2 class="section-h">Human trials on record</h2>
      <ul class="sf-list">${molecule.trials.studies.slice(0, 5).map((t) => `<li><p class="sf-statement"><a href="${esc(t.url)}" target="_blank" rel="noreferrer">${esc(t.title)}</a></p><p class="fine">${/RECRUITING|ACTIVE/.test(t.status) ? '<span class="ev-badge ev-human_trials">live</span> ' : ''}${esc(String(t.status).toLowerCase().replaceAll('_', ' '))}${t.phases?.filter((p) => p !== 'NA').length ? ` · ${esc(t.phases.filter((p) => p !== 'NA').join(', ').replaceAll('PHASE', 'Phase '))}` : ''} · ${esc(t.conditions.slice(0, 2).join(', '))}${t.enrollment ? ` · ${t.enrollment} people` : ''} · <span class="mono">${esc(t.nct_id)}</span></p></li>`).join('')}</ul>
      <p class="fine">${molecule.trials.total} registered on ClinicalTrials.gov naming this molecule as an intervention.</p>` : ''}

      <h2 class="section-h">Declared in these flavors</h2>
      ${inProducts.length ? `
      <div class="ctable-wrap">
        <table class="ctable">
          <thead><tr><th>Flavor</th><th class="num">mg per gummy</th><th>Pack line</th></tr></thead>
          <tbody>${inProducts.map((p) => `
            <tr>
              <td><a href="?product=${encodeURIComponent(p.handle)}">${esc(p.product)}</a><br /><span class="fine">${esc(p.strain || '')}</span></td>
              <td class="num">${p.mg != null ? `${p.mg}mg` : '—'}</td>
              <td class="fine">${esc(p.dose || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${claimTilesFor.length ? claimTiles(claimTilesFor) : ''}` : '<p class="fine">Not declared on any WYLD pack in this snapshot.</p>'}

      ${molecule.occurrence?.organisms?.length ? `
      <h2 class="section-h">Where it occurs in nature</h2>
      <p class="fine">${molecule.occurrence.organism_count} organisms on record via ${esc(molecule.occurrence.source)}. Top reported:</p>
      <p class="sf-statement">${molecule.occurrence.organisms.slice(0, 8).map((o) => `<a href="https://kb.terpedia.com/organism/${esc(o.id)}/" target="_blank" rel="noreferrer">${esc(o.name)}</a>`).join(' · ')}</p>` : ''}

      ${molecule.literature?.papers?.length ? `
      <h2 class="section-h">Recent literature</h2>
      <ul class="lit">${molecule.literature.papers.map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noreferrer">${esc(p.title)}</a><span class="fine">${esc(p.journal || '')} · ${esc(p.year || '')} · PMID ${esc(p.pmid)}</span></li>`).join('')}</ul>` : ''}

      ${chem ? `
      <h2 class="section-h">Identity</h2>
      <div class="molecule-panel">
        <span>Formula</span><strong>${esc(chem.formula)}</strong>
        <span>Molecular weight</span><strong>${esc(chem.molecular_weight)} g/mol</strong>
        <span>PubChem</span><strong><a href="${esc(chem.url)}" target="_blank" rel="noreferrer">CID ${esc(chem.cid)} ↗</a></strong>
        ${chem.description_source ? `<span>Description</span><strong><a href="${esc(chem.description_source.url)}" target="_blank" rel="noreferrer">${esc(chem.description_source.name)} ↗</a>, via PubChem</strong>` : ''}
      </div>` : ''}

      <h2 class="section-h">The full record</h2>
      <p class="hero-copy">Organisms it occurs in, protein assay results, literature and the evidence behind each statement live in the Terpedia knowledge base.</p>
      <a class="portal-button" href="${KB_MOLECULE}${encodeURIComponent(molecule.id)}/" target="_blank" rel="noreferrer">Open in the Terpedia knowledge base ↗</a>
      <p class="fine">Composition here is what the pack declares. The research record describes the compound at laboratory doses, not a gummy. Nothing here is medical advice.</p>
    </section>`;
  return true;
}

async function renderClaim(slug) {
  const claim = await getJSON(`data/claims/${encodeURIComponent(slug.toLowerCase())}.json`);
  if (!claim) return renderEntityStub('claim', slug);
  main().innerHTML = `
    <section class="entity">
      ${back}
      <p class="eyebrow">On the pack · ${esc(claim.sense || 'effect')} tag</p>
      <h1><span class="claim-tile claim-tile--hero">${esc(claim.tile)}</span></h1>
      <p class="hero-copy">${esc(claim.definition)}</p>
      <div class="stat-row">
        <div class="stat"><b>${claim.molecules_with_research}</b><span>declared compounds with research here</span></div>
        <div class="stat"><b>${claim.papers.toLocaleString()}</b><span>papers in the sample</span></div>
        <div class="stat"><b>${esc(LEVEL_LABEL[claim.best_evidence] || claim.best_evidence)}</b><span>best evidence${claim.best_oxford ? ` · Oxford ${esc(claim.best_oxford)}` : ''}</span></div>
        <div class="stat"><b>${claim.trials.length}</b><span>registered trials in this area</span></div>
      </div>

      ${claimBacking(claim)}

      ${claim.trials.length ? `<h2 class="section-h">Registered trials in this area</h2>
      <ul class="sf-list">${claim.trials.slice(0, 6).map((t) => `<li><p class="sf-statement"><a href="${esc(t.url)}" target="_blank" rel="noreferrer">${esc(t.title)}</a></p><p class="fine">${/RECRUITING|ACTIVE/.test(t.status) ? '<span class="ev-badge ev-human_trials">live</span> ' : ''}${esc(String(t.status).toLowerCase().replaceAll('_', ' '))} · <a href="?c=${encodeURIComponent(t.molecule_id)}">${esc(t.molecule)}</a> · ${esc(t.conditions.slice(0, 2).join(', '))} · <span class="mono">${esc(t.nct_id)}</span></p></li>`).join('')}</ul>` : ''}

      <h2 class="section-h">Flavors that carry this tag</h2>
      <div class="claim-cards">${claim.products.map((p) => `<a class="claim-card claim-card--link" href="?product=${encodeURIComponent(p.handle)}"><span class="claim-def"><b>${esc(p.name)}</b> · ${esc(p.strain || '')}</span><span class="claim-stat">${esc(p.dose || '')}${p.great_for ? ` — great for ${esc(p.great_for.replace(/^./, (c) => c.toLowerCase()))}` : ''}</span></a>`).join('')}</div>
      <p class="fine">Effect tags are Wyld’s own pack language. This page connects each tag to the published research on the cannabinoids that carry it — nothing here is a claim to treat, cure or prevent, and nothing is medical advice.</p>
    </section>`;
  return true;
}

async function renderEntity(type, slug) {
  if (type === 'molecule') return renderMolecule(slug);
  if (type === 'product') return renderProduct(slug);
  if (type === 'claim') return renderClaim(slug);
  return renderEntityStub(type, slug);
}

async function renderEntityStub(type, slug) {
  const labels = {protein:'Protein', disease:'Disease / condition', claim:'Claim', pmid:'Literature'};
  const fallback = {name: slug.replaceAll('-', ' '), summary: `Terpedia ${labels[type]} profile`, evidence: 'Profile data will be hydrated from Terpedia when the public record is connected.'};
  const record = await getJSON(`data/${type}s/${encodeURIComponent(slug)}.json`) || fallback;
  const source = type === 'pmid' ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(slug)}/` : `${TERPEDIA_PORTAL}?${type}=${encodeURIComponent(record.name)}`;
  main().innerHTML = `<section class="entity">${back}<p class="eyebrow">Terpedia ${labels[type]} profile</p><h1>${esc(record.name)}</h1><p class="hero-copy">${esc(record.summary)}</p><div class="molecule-panel"><span>Type</span><strong>${labels[type]}</strong>${type === 'pmid' ? `<span>PMID</span><strong>${esc(slug)}</strong>` : ''}<span>Evidence</span><strong>${esc(record.evidence)}</strong></div><a class="portal-button" href="${source}" target="_blank" rel="noreferrer">${type === 'pmid' ? 'Open PubMed record' : 'Open Terpedia intelligence'} ↗</a></section>`;
  return true;
}

function render() {
  const query = document.querySelector('#search').value.trim().toLowerCase();
  const visible = products.filter((p) => {
    const matchesCategory = activeFilter === 'all' || p.category === activeFilter;
    // Shoppers search by flavor and feeling, not only by compound name, so the pack
    // language on the card has to be in the index too.
    const haystack = [p.name, p.mood, p.strain, p.full_name, p.description, p.per_gummy, p.great_for, p.category, ...(p.molecules || [])].join(' ').toLowerCase();
    return matchesCategory && (!query || haystack.includes(query));
  });
  document.querySelector('#catalog').innerHTML = visible.map((p) => `
    <article class="card card--image">
      ${p.image?.src ? `<a class="card-image" href="?product=${encodeURIComponent(p.handle)}"><img src="${esc(p.image.src)}" alt="${esc(p.image.alt || p.name)}" loading="lazy" onerror="this.parentElement.remove()" /></a>` : ''}
      <div class="card-body">
        <div class="card-top"><span class="pill ${(p.category || '').toLowerCase()}">${esc(p.mood || '')}</span><span>${esc(p.per_gummy || '')}</span></div>
        <h2><a href="?product=${encodeURIComponent(p.handle)}">${esc(p.name)}</a></h2>
        <div class="strain">${esc(p.strain || '')}</div>
        <p class="description">${esc(p.description)}</p>
        <div class="molecules"><div class="molecules-label">On the pack</div><div class="molecule-list">${p.cannabinoids.map((c) => `<a href="${moleculeUrl(c.id)}">${esc(c.name)} <b>${c.mg_per_gummy}mg</b></a>`).join('')}</div></div>
        <div class="card-footer"><a href="?product=${encodeURIComponent(p.handle)}">Full record and evidence →</a><span>${esc(p.category || '')}</span></div>
      </div>
    </article>`).join('');
  document.querySelector('#empty').hidden = visible.length !== 0;
}

document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
  button.classList.add('active'); activeFilter = button.dataset.filter; render();
}));
document.querySelector('#search').addEventListener('input', render);

const params = new URLSearchParams(location.search);
const ROUTES = {c: 'molecule', product: 'product', claim: 'claim', p: 'protein', d: 'disease', pmid: 'pmid'};
const key = Object.keys(ROUTES).find((k) => params.get(k));
const route = key ? renderEntity(ROUTES[key], params.get(key)) : Promise.resolve(false);
route.then((isEntity) => { if (isEntity) return null; return Promise.all([getJSON('data/products.json'), getJSON('data/stats.json')]).then(([data, stats]) => {
  if (!data) { document.querySelector('#product-count').textContent = 'Catalog unavailable'; return; }
  products = data.products;
  document.querySelector('#product-count').textContent = `${products.length} flavors · ${data.snapshot_date} snapshot`;
  if (stats) {
    const put = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = Number(v).toLocaleString(); };
    put('stat-products', stats.products); put('stat-compounds', stats.compounds); put('stat-batches', stats.batches); put('stat-organisms', stats.organisms); put('stat-papers', stats.papers); put('stat-trials', stats.trials);
  }
  render();
});
});

// Ask the TerpeneQueen: the Terpedia multiagent chat, with whatever the reader is looking
// at sent along as context so "this gummy" and "this cannabinoid" mean the page on screen.
(() => {
  const root = document.getElementById('tq');
  if (!root) return;
  const API = window.TERPENE_QUEEN_URL || 'https://terpene-queen-715567218723.us-central1.run.app/chat';
  const toggle = root.querySelector('.tq-toggle'), panel = root.querySelector('.tq-panel'), log = root.querySelector('.tq-log');
  const form = root.querySelector('.tq-form'), input = root.querySelector('.tq-input');
  const history = [];
  // Susan live avatar: replaces the looping intro clip with a real-time HeyGen
  // LiveAvatar stream and speaks each TerpeneQueen answer out loud.
  const SUSAN = window.SUSAN_LIVE || { url: 'https://heygen-stream-proxy-715567218723.us-central1.run.app' };
  const susan = { session: null, room: null, starting: null };
  async function susanStart() {
    if (susan.session || susan.starting) return susan.starting;
    susan.starting = (async () => {
      try {
        const res = await fetch(`${SUSAN.url}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const s = await res.json();
        if (!s.session_id) throw new Error(s.message || `session ${res.status}`);
        susan.session = s;
        const { Room } = await import('https://esm.run/livekit-client@2');
        const videoSlot = root.querySelector('.tq-video video');
        const room = new Room({ adaptiveStream: true });
        room.on('trackSubscribed', (track) => {
          if (track.kind === 'video' && videoSlot) track.attach(videoSlot);
          else if (track.kind === 'audio') track.attach();
        });
        await room.connect(s.livekit_url, s.livekit_client_token);
        susan.room = room;
        if (videoSlot) videoSlot.muted = true;
      } catch (err) {
        console.error('susan session failed', err);
        susan.session = null;
      } finally {
        susan.starting = null;
      }
    })();
    return susan.starting;
  }
  async function susanSpeak(text) {
    if (!text || !SUSAN.url) return;
    try {
      await susanStart();
      if (!susan.session) return;
      const res = await fetch(`${SUSAN.url}/say`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: susan.session.session_id, text }) });
      const j = await res.json();
      if (j.error) { susan.session = null; console.error('susan say failed', j.error); }
    } catch (err) { console.error('susan speak failed', err); }
  }
  async function susanStop() {
    if (!susan.session) return;
    const s = susan.session; susan.session = null;
    try {
      if (susan.room) { await susan.room.disconnect(); susan.room = null; }
      await fetch(`${SUSAN.url}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: s.session_id }) });
    } catch (err) { console.error('susan stop failed', err); }
  }
  const open = (show) => {
    panel.hidden = !show; toggle.setAttribute('aria-expanded', String(show));
    if (show) { input.focus(); susanStart(); } else susanStop();
  };
  toggle.addEventListener('click', () => open(panel.hidden));
  root.querySelector('.tq-close').addEventListener('click', () => open(false));
  const bubble = (role, text) => { const el = document.createElement('div'); el.className = `tq-msg tq-msg--${role}`; el.textContent = text; log.appendChild(el); log.scrollTop = log.scrollHeight; return el; };
  const pageContext = () => {
    const q = new URLSearchParams(location.search);
    const h1 = document.querySelector('main h1')?.innerText?.replace(/\s+/g, ' ').trim();
    if (q.get('product')) return `the WYLD product "${h1}" (${location.href}); its declared cannabinoids and claim backing are on this page`;
    if (q.get('c')) return `the cannabinoid ${h1} (${location.href})`;
    return 'the WYLD × Terpedia catalog homepage';
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = input.value.trim(); if (!question) return;
    input.value = ''; bubble('user', question); history.push({ role: 'user', content: question });
    const answer = bubble('assistant', '…');
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: pageContext(), messages: history }) });
      if (!res.ok || !res.body) throw new Error(`API ${res.status}`);
      const reader = res.body.getReader(), dec = new TextDecoder(); let raw = '', buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) { if (!line.startsWith('data:')) continue; const p = line.slice(5).trim(); if (!p || p === '[DONE]') continue; try { const j = JSON.parse(p); if (j.error) throw new Error(j.error); raw += j.delta || ''; } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; } answer.textContent = raw || '…'; log.scrollTop = log.scrollHeight; }
      }
      const final = raw.trim() || 'I did not get an answer back — try asking another way.';
      answer.textContent = final; history.push({ role: 'assistant', content: final });
      susanSpeak(final);
      susanSpeak(final);
    } catch (err) { answer.textContent = 'The TerpeneQueen is away from the throne for a moment. Try again shortly.'; console.error('chat failed', err); }
  });
})();
