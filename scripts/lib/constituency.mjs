// Matching the constituency name UDISE+ prints on a school record to the
// constituency we hold a representative for.
//
// The two sources disagree in three ways, all visible in real data:
//   "Paderu(ST)"        vs  "Paderu"              — reservation marker
//   "Vijayawada(East)"  vs  "Vijayawada East"     — bracketed direction
//   "Pulivendula"       vs  "Pulivendla"          — transliteration
//
// The first two are mechanical. The third is not, so it is handled by a
// bounded near-match that refuses to choose when more than one candidate
// is close — showing the wrong MLA beside a failing school is far worse
// than showing none.

/** Reservation markers are metadata about the seat, not part of its name.
 *  Any OTHER bracketed text is part of the name — "(East)" distinguishes
 *  three different Vijayawada seats with three different MLAs. */
export function normalizeConstituency(name) {
  return String(name ?? '')
    .replace(/^\s*\d+\s*[-–]\s*/, '')        // leading "55-"
    .replace(/\((?:SC|ST)\)/gi, ' ')          // reservation marker
    .toUpperCase()
    .replace(/[^A-Z]/g, '');                  // brackets, spaces, hyphens
}

/** Levenshtein distance, capped: we only care whether it is small. */
export function editDistance(a, b, cap = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Index of constituencies by normalized name, built once per state. */
export function buildIndex(reps) {
  const index = new Map();
  for (const r of reps) {
    const key = normalizeConstituency(r.constituency?.name);
    if (key) index.set(key, r);
  }
  return index;
}

/** The representative for a UDISE constituency name, or null.
 *
 *  Exact normalized match first. Only if that fails does it consider a
 *  near-match, and only when exactly ONE candidate is within `maxEdit` —
 *  an ambiguous near-match returns null, because a school page that names
 *  the wrong MLA is worse than one that names none. */
export function matchConstituency(udiseName, index, maxEdit = 2) {
  const key = normalizeConstituency(udiseName);
  if (!key) return null;
  const exact = index.get(key);
  if (exact) return { rep: exact, exact: true };

  let best = null;
  let bestDist = maxEdit + 1;
  let tied = false;
  for (const [candidate, rep] of index) {
    const d = editDistance(key, candidate, maxEdit);
    if (d > maxEdit) continue;
    if (d < bestDist) { best = rep; bestDist = d; tied = false; }
    else if (d === bestDist) tied = true;
  }
  if (!best || tied) return null;
  return { rep: best, exact: false, distance: bestDist };
}
