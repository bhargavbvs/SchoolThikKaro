// Presentation helpers for the browse pages. Pure and side-effect free so
// the awkward real-data cases can be pinned down in tests.

/** Title-cases an administrative place name that arrives from UDISE+ in all
 *  caps ("SOUTH WEST GARO HILLS"). Capitalises after any non-letter, so
 *  hyphens, parentheses and digits all behave.
 *
 *  Deliberately NOT applied to school names: ~30% of them carry
 *  abbreviations (LPS, UPS, SSA, GOVT.) that title-casing corrupts —
 *  "AGGONGITIM LPS" would become "Aggongitim Lps", and LPS means Lower
 *  Primary School. School names render verbatim. */
export function titleCase(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/(^|[^a-z])([a-z])/g, (_, before, ch) => before + ch.toUpperCase());
}

/** One honest sentence placing a rate against a baseline.
 *
 *  Banded rather than always printing a multiple: at the extremes of the
 *  real spread (states run 29.7% down to 0.1% against a 5.63% national
 *  rate) "0.02× the national average" is technically true and useless. */
export function compareToBaseline(rate, baseline, label) {
  if (typeof rate !== 'number' || typeof baseline !== 'number') return null;
  if (!Number.isFinite(rate) || !Number.isFinite(baseline) || baseline <= 0) return null;

  const ratio = rate / baseline;
  const base = `${baseline.toFixed(1)}%`;
  if (ratio >= 1.5) return `${ratio.toFixed(1)}× the ${label} (${base})`;
  if (ratio >= 0.67) return `about the ${label} (${base})`;
  return `below the ${label} (${base})`;
}

/** Bar width as a percentage, scaled to the largest rate in the same table
 *  rather than to 100%. With a 29.7% maximum and a 4.7% median, a 0-100%
 *  scale renders nearly every bar as an invisible sliver, which defeats the
 *  point of having bars. The real number is always rendered beside the bar,
 *  so the bar is a scanning aid and never the sole source of the value. */
export function barWidth(rate, maxRate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return 0;
  if (typeof maxRate !== 'number' || !Number.isFinite(maxRate) || maxRate <= 0) return 0;
  return Math.max(1, Math.round((rate / maxRate) * 100));
}

/** Severity class for a bar, measured against the NATIONAL rate rather than
 *  the table's own maximum.
 *
 *  Bar length is relative (so a page can be scanned); bar colour is absolute
 *  (so the same visual weight never means two different things on two
 *  different pages). Kerala's worst district is 0.8% and fills its bar
 *  exactly as Meghalaya's worst (46.5%) fills its own — without this, the
 *  two pages would look equally alarming. Colour is what keeps it honest. */
export function severityOf(rate, nationalRate) {
  if (typeof rate !== 'number' || typeof nationalRate !== 'number') return 'is-mid';
  if (!Number.isFinite(rate) || !Number.isFinite(nationalRate) || nationalRate <= 0) return 'is-mid';
  const ratio = rate / nationalRate;
  if (ratio >= 1.5) return 'is-high';
  if (ratio >= 0.67) return 'is-mid';
  return 'is-low';
}
