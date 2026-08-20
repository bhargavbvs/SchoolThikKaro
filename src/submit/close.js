// src/submit/close.js
//
// Closing a report flow has to leave the reader somewhere.
//
// The /add route hides #map before opening the picker, so emptying
// #submit-root and hiding it left a blank white page with no way out —
// nothing on screen, and a URL that re-renders the same nothing on
// reload. Closing now returns to the site.

/** Dismisses a flow and sends the reader back where they came from, or to
 *  the record if they arrived here directly. */
export function closeFlow(root, { home = '/' } = {}) {
  root.hidden = true;
  root.innerHTML = '';
  // A map still on screen means there is something to come back to; the
  // report routes hide it, and those are the ones that stranded people.
  const map = document.getElementById('map');
  const mapVisible = map && map.style.display !== 'none';
  if (mapVisible) return;
  if (map) map.style.display = '';
  window.location.href = home;
}
