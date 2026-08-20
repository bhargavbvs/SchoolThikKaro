// src/submit/submit.js
import { SOURCE_YEAR } from '../config.js';
import { detectPlatform } from './gps.js';
import { renderDesktopGateHTML, paintQR, handoffURL } from './qr.js';
import { iconEl } from '../lib/icons.js';

/** What the report is about. A school fails its students in more ways than
 *  one, and someone standing in front of a school with no drinking water
 *  should not have to pretend it is a toilet problem to be heard.
 *
 *  The published FIGURES remain girls' toilets only, because that is what
 *  the UDISE+ release measures. This list is what a citizen may report,
 *  which is a wider thing than what the government counted. */
export const CATEGORIES = [
  { value: 'girls_toilet',   label: 'Girls\u2019 toilet',        icon: 'ban' },
  { value: 'boys_toilet',    label: 'Boys\u2019 toilet',         icon: 'ban' },
  { value: 'drinking_water', label: 'Drinking water',       icon: 'droplet' },
  { value: 'handwashing',    label: 'Handwashing',          icon: 'droplet' },
  { value: 'electricity',    label: 'Electricity',          icon: 'sun' },
  { value: 'classroom',      label: 'Classrooms',           icon: 'warning' },
  { value: 'boundary_wall',  label: 'Boundary wall or gate', icon: 'shield' },
  { value: 'ramp',           label: 'Ramp or accessibility', icon: 'warning' },
  { value: 'playground',     label: 'Playground',           icon: 'warning' },
  { value: 'other',          label: 'Something else',       icon: 'warning' },
];

/** One condition set for every category, rather than a bespoke list each.
 *  "There is none at all" means the same thing about a ramp as about a
 *  toilet, and a reporter should not have to learn a new vocabulary per
 *  facility. The category says what; this says what state it is in. */
export const FINDINGS = [
  { value: 'absent',     label: 'There is none at all', icon: 'ban' },
  { value: 'broken',     label: 'It exists but is broken or unusable', icon: 'warning' },
  { value: 'locked',     label: 'It exists but is locked or off-limits', icon: 'lock' },
  { value: 'no_water',   label: 'It exists but there is no water', icon: 'droplet' },
  { value: 'inadequate', label: 'It exists but is not enough for the students', icon: 'warning' },
  { value: 'working',    label: 'This one is fine', icon: 'checkCircle' },
];

// Amber -> red, mirroring the reference app's Minor/Moderate/Severe/Critical
// dot scale: colour alone communicates rank before anyone reads a word.
export const SEVERITIES = [
  { value: 'usable',        label: 'Usable',        hint: 'Minor issues \u2014 students use it', dot: '#f6c453' },
  { value: 'barely_usable', label: 'Barely usable', hint: 'Students avoid it', dot: '#f0932b' },
  { value: 'unusable',      label: 'Unusable',      hint: 'No one can use it', dot: '#e2633c' },
  { value: 'absent',        label: 'Does not exist', hint: 'No structure at all', dot: '#e0473e' },
];

const INDICATOR_TEXT = {
  no_girls_toilet: 'No girls\u2019 toilet',
  girls_toilet_nonfunctional: 'Girls\u2019 toilet does not function',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderFormHTML(school) {
  return `
    <header class="sub-head">
      <h2>Report what you found</h2>
      <button id="sub-close" type="button" aria-label="Close">${iconEl('x')}</button>
    </header>

    <section class="sub-school">
      <p class="s-name">${esc(school.name)}</p>
      <p class="s-meta">${esc(school.district)}, ${esc(school.state)} \u00b7 UDISE ${esc(school.udise)}</p>
      <p class="s-claim">Reported by this school to ${esc(SOURCE_YEAR)}:
        <strong>${esc(INDICATOR_TEXT[school.indicator] ?? 'Unknown')}</strong></p>
    </section>

    <fieldset class="sub-category">
      <legend>What is the problem with? <span class="req">*</span> <span class="legend-hint">choose all that apply</span></legend>
      ${CATEGORIES.map((c) => `
        <label class="opt opt-cat">
          <input type="checkbox" name="category" value="${c.value}" />
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
        placeholder="Optional \u2014 what you saw, in your own words"></textarea></label>

    <section class="sub-photo">
      <h3>Photo <span class="req">*</span></h3>
      <p class="guidance">${iconEl('warning')} Photograph the facility only. Do not photograph students.</p>
      <div id="capture-slot"></div>
    </section>

    <div id="sub-errors" class="errors" hidden></div>
    <button id="sub-send" type="button" disabled>
      <span class="btn-label">Submit report</span>
    </button>
    <p class="anon">${iconEl('shield')} Anonymous \u2014 we never record who you are. We do record where the photo was taken, to verify it.</p>
  `;
}

export function validateSubmission({ category, finding, hasPhoto, gate }) {
  const errors = [];
  if (!category) errors.push('Choose what the problem is with.');
  if (!finding) errors.push('Choose what you found.');
  if (!hasPhoto) errors.push('A photo is required.');
  if (gate && !gate.canSubmit) errors.push(gate.reason);
  return { valid: errors.length === 0, errors };
}

/** Name and area are what make an unlisted-school submission actionable —
 *  a moderator has to be able to find the place. Everything else is
 *  optional. Lives here rather than in addSchool.js so camera.js can reach
 *  it without closing an import cycle. */
export function validateIdentity(school) {
  const errors = [];
  if (!school.name) errors.push('Enter the school\u2019s name.');
  if (!school.area) errors.push('Enter the village or area, so it can be found.');
  return { valid: errors.length === 0, errors };
}

export async function openSubmitFlow(school) {
  const root = document.getElementById('submit-root');
  root.hidden = false;
  root.innerHTML = renderFormHTML(school);

  const slot = root.querySelector('#capture-slot');
  if (detectPlatform() === 'desktop') {
    slot.innerHTML = renderDesktopGateHTML(school, window.location.origin);
    await paintQR(slot, handoffURL(school, window.location.origin));
  } else {
    const { mountCapture } = await import('./camera.js');
    mountCapture(slot, school, root);
  }

  root.querySelector('#sub-close').addEventListener('click', () => {
    root.hidden = true; root.innerHTML = '';
  });
}
