// src/submit/submit.js
import { SOURCE_YEAR } from '../config.js';
import { detectPlatform } from './gps.js';
import { renderDesktopGateHTML, paintQR, handoffURL } from './qr.js';
import { iconEl } from './icons.js';

export const FINDINGS = [
  { value: 'no_toilet', label: 'No toilet for girls at all', icon: 'ban' },
  { value: 'locked',    label: 'Toilet exists but locked', icon: 'lock' },
  { value: 'no_water',  label: 'Toilet exists, no water', icon: 'droplet' },
  { value: 'unusable',  label: 'Toilet exists, unusable condition', icon: 'warning' },
  { value: 'working',   label: 'Toilet is working fine', icon: 'checkCircle' },
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
      <span class="btn-label">Submit report</span>
    </button>
    <p class="anon">${iconEl('shield')} Anonymous \u2014 we never record who you are. We do record where the photo was taken, to verify it.</p>
  `;
}

export function validateSubmission({ finding, hasPhoto, gate }) {
  const errors = [];
  if (!finding) errors.push('Choose what you found.');
  if (!hasPhoto) errors.push('A photo is required.');
  if (gate && !gate.canSubmit) errors.push(gate.reason);
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
