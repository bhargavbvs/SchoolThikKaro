// Sharding 78,744 school names into something a phone can search.
//
// A flat index is 5.7MB, which nobody on rural data is downloading to find
// one school. Sharding by first letter does not help either: Indian school
// names begin with GOVT, PS, MPPS and ZPHS, so "P" alone holds 20,772.
//
// So the index is by WORD, not by name — every distinctive word a school's
// name contains, keyed on its first three letters. Typing "vedu" reaches
// MPPS VEDURUPATTU RAJUPALEM without knowing it starts with MPPS, and the
// largest shard is 171KB against a median of four entries.

/** Words too common to be worth indexing: they would each pull thousands
 *  of schools into one shard and tell the reader nothing. */
export const STOPWORDS = new Set([
  'SCHOOL', 'SCHOOLS', 'GOVT', 'GOVERNMENT', 'PRIMARY', 'UPPER', 'LOWER',
  'HIGH', 'SECONDARY', 'THE', 'AND', 'MPPS', 'ZPHS', 'VIDYALAYA',
]);

export const SHARD_LEN = 3;

/** The words a name should be findable by.
 *
 *  Falls back to the generic words when a name has nothing else — 49
 *  schools are called only some arrangement of "Govt Primary School", and
 *  unreachable is worse than crowded. */
export function indexWords(name) {
  const words = String(name ?? '').toUpperCase().match(/[A-Z]{3,}/g) ?? [];
  const distinct = words.filter((w) => !STOPWORDS.has(w));
  return [...new Set(distinct.length ? distinct : words)];
}

/** Shard key for a search term, or null when it is too short to bother. */
export function shardFor(term) {
  const t = String(term ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return t.length >= SHARD_LEN ? t.slice(0, SHARD_LEN) : null;
}

/** Every shard a school belongs in. */
export function shardsForName(name) {
  return [...new Set(indexWords(name)
    .map((w) => w.slice(0, SHARD_LEN))
    .filter((k) => k.length === SHARD_LEN))];
}

/** Does this school match what was typed? Substring, case- and
 *  punctuation-insensitive, so "st marys" finds "ST. MARY'S". */
export function matches(name, term) {
  const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return norm(name).includes(norm(term));
}
