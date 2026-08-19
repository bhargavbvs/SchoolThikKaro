// "Who answers for these schools."
//
// A block's schools can fall in more than one assembly constituency, so
// this returns a list, not a person. Every entry states a fact anyone can
// check: this seat covers these schools, and this is who currently holds
// it. It is not a claim that they caused anything — the record predates
// most terms, and the page must never imply otherwise.

import { buildIndex, matchConstituency } from './constituency.mjs';

/** Builds the lookup once from data/representatives.json. */
export function indexRepresentatives(reps) {
  return buildIndex((reps?.rows ?? []).map((r) => ({
    constituency: { number: r.number, name: r.name, district: r.district },
    representative: r,
  })));
}

/** The constituencies a set of schools falls in, each with its member.
 *
 *  `schools` is any list carrying a `constituency` string as UDISE+ spells
 *  it. Counts come out with it, so a page can say how many of its schools
 *  each seat actually covers rather than implying all of them.
 *
 *  A constituency we cannot match is still returned, with member null: the
 *  reader learns the seat exists and that we do not know who holds it,
 *  which is honest. Silently dropping it would misreport coverage. */
export function accountableFor(schools, index) {
  const counts = new Map();
  for (const s of schools ?? []) {
    const name = s?.constituency;
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const out = [];
  for (const [name, schoolCount] of counts) {
    const hit = index ? matchConstituency(name, index) : null;
    const rep = hit?.rep?.representative ?? null;
    out.push({
      constituency: displayName(name),
      schools: schoolCount,
      member: rep?.member ?? null,
      party: rep?.party ?? null,
      since: rep?.since ?? null,
      source: rep?.source ?? null,
      // An inexact name match is still a match, but the page should be
      // able to mark it rather than present a guess as a certainty.
      exact: hit ? hit.exact : null,
    });
  }
  // Most schools first: the seat that owns the problem leads.
  return out.sort((a, b) => b.schools - a.schools);
}

/** UDISE+ prints "Paderu(ST)" and "55-SALMANPARA (ST)". Neither is how a
 *  person says the name, so tidy it for display without losing the
 *  reservation, which is real information about the seat. */
export function displayName(raw) {
  const s = String(raw ?? '').replace(/^\s*\d+\s*[-–]\s*/, '').trim();
  const m = s.match(/^(.*?)\s*\((SC|ST)\)\s*$/i);
  if (m) return `${titleish(m[1])} (${m[2].toUpperCase()})`;
  // Any other bracket is part of the name ("Vijayawada(East)") and just
  // needs the space UDISE+ omits.
  return titleish(s.replace(/\s*\(/, ' ('));
}

function titleish(s) {
  // Only re-case words that are entirely uppercase: "Vijayawada(East)"
  // is already correct, and lowercasing it would be a regression.
  return s.split(/\s+/).map((w) => (/^[A-Z]+$/.test(w)
    ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
}

/** One sentence a reader can act on, or null when we have no name. */
export function askLine(entry) {
  if (!entry?.member) return null;
  const party = entry.party ? ` (${entry.party})` : '';
  return `${entry.member}${party} holds ${entry.constituency}.`;
}
