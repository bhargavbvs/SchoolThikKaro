/** URL slug from an administrative name. Digits are kept because real block
 *  names contain them (e.g. "24 PARGANAS"). */
export function slugify(name) {
  const s = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'unnamed';
}

/** Maps each distinct name to its slug, throwing if two DIFFERENT names
 *  collide on one slug. A collision would silently make one page
 *  unreachable, so it must fail the build rather than be tolerated. */
export function assertNoCollisions(names, label) {
  const bySlug = new Map();
  const out = new Map();
  for (const name of names) {
    const slug = slugify(name);
    const seen = bySlug.get(slug);
    if (seen !== undefined && seen !== name) {
      throw new Error(
        `slug collision (${label}): "${seen}" and "${name}" both slug to "${slug}"`);
    }
    bySlug.set(slug, name);
    out.set(name, slug);
  }
  return out;
}
