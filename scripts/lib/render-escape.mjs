/** HTML-escaping, in its own module so choropleth.mjs and render.mjs can
 *  both use it without either importing the other. render.mjs re-exports it
 *  as its own `esc` — there must only ever be one of these. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
