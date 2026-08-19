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

import { FINDINGS, SEVERITIES, validateIdentity } from './submit.js';

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

export async function openAddSchoolFlow() {
  const root = document.getElementById('submit-root');
  root.hidden = false;
  root.innerHTML = renderAddSchoolHTML();

  // A live object the capture pipeline holds a reference to, so what the
  // reporter types is read at submit time rather than at mount time.
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
