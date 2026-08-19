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
export function renderChoropleth({ shapes, viewBox, byKey, nationalRate, title }) {
  const breaks = binBreaks(nationalRate);
  const paths = shapes.map((s) => {
    const row = byKey.get(s.key);
    const bin = binOf(row?.rate, breaks);
    const cls = bin === null ? 'nodata' : `b${bin}`;
    const label = row ? `${row.label}` : `${s.label} — not in this release`;
    // No <a> for a state we have no page for: a link to nothing is worse
    // than no link, and the "not in this release" title says why.
    const shape = `<path class="st ${cls}" d="${s.d}"><title>${esc(label)}</title></path>`;
    return row ? `<a href="/state/${esc(row.slug)}" aria-label="${esc(label)}">${shape}</a>` : shape;
  });
  return `<svg class="india" viewBox="${esc(viewBox)}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">
<title>${esc(title)}</title>
${paths.join('\n')}
</svg>`;
}

/** The legend: five swatches, no numbers, matching the map's shades. */
export function renderLegend() {
  const swatches = [0, 1, 2, 3, 4].map((i) => `<span class="sw b${i}"></span>`).join('');
  return `<div class="legend"><span class="lo">Fewer</span>${swatches}<span class="hi">More</span></div>`;
}
