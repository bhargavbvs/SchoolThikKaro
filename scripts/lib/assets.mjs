/** Pulls the real, hashed <script>/<link rel="stylesheet"> tags that
 *  `vite build` wrote into dist/index.html, so the prerendered homepage can
 *  reference the actual built files in dist/assets/ instead of the dev-time
 *  /src/main.js path. A homepage shipped with that dev-time default 404s in
 *  production — this is the fix for a real regression that shipped once
 *  already, so this extraction is deliberately isolated here and unit
 *  tested rather than left inline in prerender.mjs. */
export function extractAssetTags(html) {
  const scriptTag = html.match(/<script[^>]*\ssrc="[^"]*"[^>]*><\/script>/)?.[0];
  if (!scriptTag) {
    throw new Error(
      'extractAssetTags: no built <script src="..."> tag found — check that `vite build` actually ran before this was called',
    );
  }

  // Vite does not guarantee attribute order on the built <link> tag — a
  // past regression had `href` appear before `rel="stylesheet"`, which a
  // regex anchored on rel-then-href silently missed. Match each whole
  // <link ...> tag first, then test/extract from its full attribute set
  // regardless of order.
  const linkTags = html.match(/<link\b[^>]*>/g) ?? [];
  const styleTag = linkTags.find((tag) => /\brel="stylesheet"/.test(tag));
  const style = styleTag?.match(/\shref="([^"]*)"/)?.[1] ?? null;

  return { script: scriptTag, style };
}
