// Small inline-SVG icon set shared across the submit flow. All icons use
// stroke="currentColor" so a wrapping element's `color` tints them — no
// separate color prop needed, and no icon font/library dependency.
const wrap = (paths, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  phone: wrap('<rect x="6" y="2" width="12" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>'),
  pin: wrap('<path d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  shield: wrap('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  warning: wrap('<path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/>'),
  checkCircle: wrap('<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'),
  chevronDown: wrap('<polyline points="6 9 12 15 18 9"/>'),
  camera: wrap('<path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  x: wrap('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  droplet: wrap('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
  ban: wrap('<circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/>'),
};

export function iconEl(name, extraClass = '') {
  return `<span class="icon${extraClass ? ' ' + extraClass : ''}">${icons[name] ?? ''}</span>`;
}
