// src/submit/addSchool.js
//
// Reporting a school the UDISE+ release does not list.
//
// The release covers the schools the government recorded. A citizen
// standing outside one it missed has, until now, had nowhere to put that.
// This is that place — and it is deliberately a different destination from
// a report on a listed school: it goes to school_submissions, never to the
// figures this site publishes, which are the government's own record and
// are worth nothing the moment they are mixed with anything else.

import { CATEGORIES, FINDINGS, SEVERITIES, validateIdentity } from './submit.js';

export { validateIdentity };
import { detectPlatform } from './gps.js';
import { iconEl } from '../lib/icons.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderAddSchoolHTML() {
  return `
    <header class="sub-head">
      <h2>Report a school that isn’t listed</h2>
      <button id="sub-close" type="button" aria-label="Close">${iconEl('x')}</button>
    </header>

    <section class="sub-school">
      <p class="s-claim">This school is not in the government’s ${esc('UDISE+ 2024-25')}
        release. We will publish it separately, marked as reported by a
        citizen — never inside the official figures.</p>
    </section>

    <fieldset class="sub-identity">
      <legend>Which school? <span class="req">*</span></legend>
      <label class="fld"><span>School name <span class="req">*</span></span>
        <input id="add-name" type="text" autocomplete="off"
               placeholder="As written on the board outside" /></label>
      <label class="fld"><span>Village or area <span class="req">*</span></span>
        <input id="add-area" type="text" autocomplete="off"
               placeholder="The village, ward or locality" /></label>
      <label class="fld"><span>District</span>
        <input id="add-district" type="text" autocomplete="off" /></label>
      <label class="fld"><span>UDISE code, if the board shows one</span>
        <input id="add-udise" type="text" inputmode="numeric" autocomplete="off" /></label>
    </fieldset>

    <fieldset class="sub-category">
      <legend>What is the problem with? <span class="req">*</span></legend>
      ${CATEGORIES.map((c) => `
        <label class="opt opt-cat">
          <input type="radio" name="category" value="${c.value}" />
          ${iconEl(c.icon, 'opt-icon')}
          <span class="o-label">${esc(c.label)}</span>
        </label>`).join('')}
    </fieldset>

    <fieldset class="sub-findings">
      <legend>What did you find? <span class="req">*</span></legend>
      ${FINDINGS.map((f) => `
        <label class="opt opt-finding">
          <input type="radio" name="finding" value="${f.value}" />
          ${iconEl(f.icon, 'opt-icon')}
          <span class="o-label">${esc(f.label)}</span>
        </label>`).join('')}
    </fieldset>

    <fieldset class="sub-severity">
      <legend>How bad is it?</legend>
      ${SEVERITIES.map((s) => `
        <label class="opt opt-severity">
          <input type="radio" name="severity" value="${s.value}" />
          <span class="sev-dot" style="--dot:${s.dot}"></span>
          <span class="o-text">
            <span class="o-label">${esc(s.label)}</span>
            <span class="o-hint">${esc(s.hint)}</span>
          </span>
        </label>`).join('')}
    </fieldset>

    <label class="fld sub-note"><span>Anything else we should know?</span>
      <textarea id="sub-note" rows="3"
        placeholder="Optional — what you saw, in your own words"></textarea></label>

    <section class="sub-photo">
      <h3>Photo <span class="req">*</span></h3>
      <p class="guidance">${iconEl('warning')} Photograph the facility only. Do not photograph students.</p>
      <div id="capture-slot"></div>
    </section>

    <div id="sub-errors" class="errors" hidden></div>
    <button id="sub-send" type="button" disabled>
      <span class="btn-label">Submit</span>
    </button>
    <p class="anon">${iconEl('shield')} Anonymous — we never record who you are. We do record where the photo was taken, to verify it.</p>
  `;
}

/** The identity a reporter typed, as the shape mountCapture and buildPayload
 *  both expect. lat/lng are deliberately null: there is no recorded location
 *  for a school with no record, which is what forces tier to 'unverified'. */
export function readSchoolIdentity(root) {
  const val = (id) => root.querySelector(id)?.value.trim() ?? '';
  return {
    kind: 'unlisted',
    name: val('#add-name'),
    area: val('#add-area'),
    district: val('#add-district'),
    state: '',
    udise: val('#add-udise'),
    lat: null,
    lng: null,
  };
}

/** Prefills the identity fields from a school the picker found, so a
 *  reader who recognised their school does not retype it. A UDISE match
 *  carries its code through; an OSM one does not have one to carry. */
export function applyCandidate(root, candidate) {
  if (!candidate) return;
  const set = (id, v) => { const el = root.querySelector(id); if (el && v) el.value = v; };
  set('#add-name', candidate.name);
  set('#add-area', candidate.area);
  set('#add-udise', candidate.udise ?? '');
}

export async function openAddSchoolFlow(candidate = null) {
  const root = document.getElementById('submit-root');
  root.hidden = false;
  root.innerHTML = renderAddSchoolHTML();

  // A live object the capture pipeline holds a reference to, so what the
  // reporter types is read at submit time rather than at mount time.
  applyCandidate(root, candidate);
  const school = readSchoolIdentity(root);
  const sync = () => Object.assign(school, readSchoolIdentity(root));
  root.addEventListener('input', sync);

  const slot = root.querySelector('#capture-slot');
  if (detectPlatform() === 'desktop') {
    slot.innerHTML = `<div class="gate gate-camera">
      <span class="gate-badge">${iconEl('camera')}</span>
      <h3>Use your phone for this</h3>
      <p>A report needs a photo taken on the spot and the location it was
         taken at. Open this page on the phone you are carrying.</p>
    </div>`;
  } else {
    const { mountCapture } = await import('./camera.js');
    mountCapture(slot, school, root);
  }

  root.querySelector('#sub-close').addEventListener('click', () => {
    root.hidden = true; root.innerHTML = '';
  });
}
