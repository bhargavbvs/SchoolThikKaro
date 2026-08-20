// src/submit/picker.js
//
// The step before the form: which school are you standing at?
//
// This is the site's front door for reporting. Most schools in India are
// not in our set — the UDISE+ release only lets us enumerate the ones
// already flagged — so the picker must work when we recognise nothing, and
// typing a name is always available under the list rather than behind it.

import { nearbySchools } from './nearby.js';
import { getFix } from './gps.js';
import { iconEl } from '../lib/icons.js';
import { closeFlow } from './close.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderPickerHTML() {
  return `<div class="sub-shell">
    <button id="sub-close" type="button" aria-label="Close">${iconEl('x')}</button>
    <h1 class="sub-title">Report a school</h1>
    <p class="sub-sub">Your identity is never recorded. We record where the
      photo was taken, so the report can be checked.</p>
    <ul class="sub-assure">
      <li>· Anonymous</li><li>· No login</li><li>· Published once reviewed</li>
    </ul>

    <section class="sub-card">
      <h3>Which school are you at?</h3>
      <p class="lede">We use your location to list what is nearby.</p>
      <div id="pick-status" class="pick-status">
        <span class="pick-spin" aria-hidden="true"></span>Finding schools near you…
      </div>
      <ul id="pick-list" class="pick-list"></ul>
      <div class="pick-manual">
        <p class="o-hint">Not the right one, or nothing listed?</p>
        <button id="pick-type" type="button" class="pick-type">Enter the school myself →</button>
      </div>
    </section>
  </div>`;
}

/** One row. A school we hold is marked as being in the government record —
 *  the reader should know which of these has a document behind it. */
export function renderCandidate(c) {
  const far = c.distanceM > 500;
  return `<li>
    <button type="button" data-id="${esc(c.id)}">
      <span class="c-name">${esc(c.name)}</span>
      <span class="c-meta">${c.distanceM}m away${c.area ? ` · ${esc(c.area)}` : ''}</span>
      ${c.source === 'udise'
        ? '<span class="c-tag c-known">In the government record</span>'
        : '<span class="c-tag">Not in the government record</span>'}
      ${far ? '<span class="c-tag c-far">You may be too far to verify</span>' : ''}
    </button></li>`;
}

/** Copy for the case that matters most: we recognise nothing. It must not
 *  read as a failure — for most of India it is simply the truth, and the
 *  reader can still report. */
export const NOTHING_NEARBY =
  'No school found near you. That is common — most schools are not in any list we can search. Enter it yourself and the report still counts.';

export async function openPicker(onPick) {
  const root = document.getElementById('submit-root');
  root.hidden = false;
  root.innerHTML = renderPickerHTML();

  const status = root.querySelector('#pick-status');
  const list = root.querySelector('#pick-list');

  root.querySelector('#sub-close').addEventListener('click', () => {
    closeFlow(root);
  });
  root.querySelector('#pick-type').addEventListener('click', () => onPick(null));

  let fix = null;
  try {
    fix = await getFix();
  } catch {
    status.innerHTML = `${iconEl('warning')} We need your location to find the school you are at.`;
    return;
  }

  const found = await nearbySchools(fix.lat, fix.lng);
  if (!found.length) {
    status.textContent = NOTHING_NEARBY;
    return;
  }
  status.innerHTML = `${iconEl('checkCircle')} ${found.length} school${found.length === 1 ? '' : 's'} near you`;
  list.innerHTML = found.map(renderCandidate).join('');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    onPick(found.find((c) => c.id === btn.dataset.id) ?? null);
  });
}
