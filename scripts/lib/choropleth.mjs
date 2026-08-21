// The static state map: a shaded India built at build time, no JavaScript
// and no map library. Pure string-building so the binning — the part that
// can quietly lie — is testable.

import { esc } from './render-escape.mjs';

/** Join key for a state name.
 *
 *  The shapes come from a survey-department district file and the figures
 *  come from UDISE+; the two spell the same state differently ("JAMMU &
 *  KASHMIR" against "JAMMU AND KASHMIR"). Both sides normalise through
 *  this one function, so a spelling difference can never silently leave a
 *  state unshaded. */
export function stateKey(name) {
  return String(name ?? '').toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z]/g, '');
}

/** Cut points for the five shades, as multiples of the national rate.
 *
 *  ABSOLUTE, not quantile. Quantile bins would always paint a fifth of the
 *  states in the darkest shade — even in a country where every state was
 *  doing well — which makes the map a picture of the ranking rather than of
 *  the problem. Tying the cuts to the national rate keeps the map saying
 *  the same thing the table bars say (see severityOf in format.mjs): the
 *  same darkness means the same multiple of the national rate, on this map
 *  and on any future one. */
export const BIN_MULTIPLES = [0.5, 1, 2, 4];

export function binBreaks(nationalRate) {
  if (typeof nationalRate !== 'number' || !Number.isFinite(nationalRate) || nationalRate <= 0) {
    return null;
  }
  return BIN_MULTIPLES.map((m) => m * nationalRate);
}

/** Shade index 0-4 for a rate, or null when the rate is unknown.
 *
 *  null is a real answer, not a zero: a state we have no denominator for is
 *  painted as "no data" rather than as "no problem". */
export function binOf(rate, breaks) {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  if (!Array.isArray(breaks) || breaks.length === 0) return null;
  let bin = 0;
  for (const b of breaks) if (rate > b) bin++;
  return bin;
}

/** The whole map as one <svg>. Each state is a link to its own page, so the
 *  map works with JavaScript disabled and is crawlable — it is a set of
 *  links that happens to be shaped like India.
 *
 *  Deliberately carries no numbers: the ledger beside it is where figures
 *  are read. A number floating on a map invites comparing two states by
 *  eye across different areas, which is exactly the misreading the table is
 *  there to prevent. */
/** Centroid of a path's largest ring, for placing a label.
 *
 *  Area-weighted, not a bounding-box centre: a bounding box puts
 *  Meghalaya's label out over Bangladesh, because the box spans a shape
 *  that is nowhere near rectangular. */
export function pathCentroid(d) {
  const rings = String(d ?? '').split('M').filter(Boolean).map((r) =>
    [...r.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]));
  let best = null;
  let bestArea = 0;
  for (const pts of rings) {
    if (pts.length < 3) continue;
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
      a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f;
    }
    if (!a) continue;
    const area = Math.abs(a / 2);
    if (area > bestArea) { bestArea = area; best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return best;
}

/** The bounding box a state's outline occupies, for deciding whether a
 *  label can sit inside it. */
export function pathBounds(d) {
  const pts = [...String(d ?? '').matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)]
    .map((m) => [+m[1], +m[2]]);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Places labels worst-first, dropping any that would collide with one
 *  already placed or overflow the state it names.
 *
 *  Without this the four worst states — all small and all in the
 *  north-east — piled their names on top of each other into something
 *  unreadable. A label that cannot be read is worse than no label,
 *  because it also hides the map underneath it. */
export function placeLabels(candidates, { charW = 7.4, lineH = 19 } = {}) {
  const placed = [];
  for (const c of candidates) {
    const at = pathCentroid(c.d);
    const box = pathBounds(c.d);
    if (!at || !box) continue;
    const w = c.label.length * charW;
    // A label wider than the shape it names reads as belonging to the
    // neighbour it spills into.
    if (w > box.w * 1.05) continue;
    const rect = { x1: at[0] - w / 2, x2: at[0] + w / 2, y1: at[1] - lineH / 2, y2: at[1] + lineH / 2 };
    if (placed.some((p) => !(rect.x2 < p.x1 || rect.x1 > p.x2 || rect.y2 < p.y1 || rect.y1 > p.y2))) continue;
    placed.push(rect);
    c.at = at;
  }
  return candidates.filter((c) => c.at);
}

/** Diagonal hatch for states with no figures.
 *
 *  It used to be the palest step on the same ramp, which measured 1.09:1
 *  against the lightest shaded bin — invisible. A state we have not
 *  measured then looked exactly like a state doing well, which is the one
 *  claim this map must never make. A hatch is categorically different from
 *  a tone, so it cannot be misread as "a bit less". */
const HATCH = `<defs><pattern id="nodata" width="6" height="6"
  patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect width="6" height="6" fill="var(--b-nodata)"/>
  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--rule)" stroke-width="1.6"/>
</pattern></defs>`;

export function renderChoropleth({ shapes, viewBox, byKey, nationalRate, title, labelTop = 0 }) {
  const breaks = binBreaks(nationalRate);
  const paths = shapes.map((s) => {
    const row = byKey.get(s.key);
    const bin = binOf(row?.rate, breaks);
    const cls = bin === null ? 'nodata' : `b${bin}`;
    const label = row ? `${row.label}` : `${s.label} — not in this release`;
    // No <a> for a state we have no page for: a link to nothing is worse
    // than no link, and the "not in this release" title says why.
    // data-key lets the ledger beside the map find its state and vice
    // versa, which is what makes the two one view rather than two.
    // Figures ride on the path so the hover card needs no request: the
    // whole point of it is that it appears the instant the cursor lands.
    const facts = row ? ` data-name="${esc(row.name ?? s.label)}"`
      + ` data-flagged="${esc(row.flagged ?? '')}"`
      + ` data-common="${esc(row.common ?? '')}"`
      + ` data-total="${esc(row.total ?? '')}"`
      + ` data-top="${esc(row.top ?? '')}"` : '';
    const shape = `<path class="st ${cls}" d="${s.d}" data-key="${esc(s.key)}"${facts}><title>${esc(label)}</title></path>`;
    return row ? `<a href="/state/${esc(row.slug)}" aria-label="${esc(label)}" data-key="${esc(s.key)}">${shape}</a>` : shape;
  });
  // Labels only for the worst few. Every state named turns the map into
  // an unreadable list; the darkest are the ones a reader is trying to
  // identify, and the rest are a tap or a hover away.
  const ranked = shapes
    .map((s) => ({ s, rate: byKey.get(s.key)?.rate ?? null }))
    .filter((x) => typeof x.rate === 'number')
    .sort((a, b) => b.rate - a.rate)
    .slice(0, labelTop);
  const labels = placeLabels(ranked.map(({ s }) => ({ label: s.label, d: s.d })))
    .map((c) => `<text class="india-label" x="${c.at[0].toFixed(0)}" y="${c.at[1].toFixed(0)}"
      text-anchor="middle">${esc(c.label)}</text>`).join('\n');

  return `<svg class="india" viewBox="${esc(viewBox)}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">
<title>${esc(title)}</title>
${HATCH}
${paths.join('\n')}
${labels}
</svg>`;
}

/** The legend: five swatches, no numbers, matching the map's shades. */
export function renderLegend() {
  const swatches = [0, 1, 2, 3, 4].map((i) => `<span class="sw b${i}"></span>`).join('');
  // "No data" belongs in the legend, not in a paragraph underneath. It is
  // the one thing about this map a reader can get wrong, and a key is
  // where they look when a shade puzzles them.
  return `<div class="legend"><span class="lo">Fewer</span>${swatches}<span class="hi">More</span>`
    + `<span class="sw sw-nodata"></span><span class="hi">No data</span></div>`;
}
