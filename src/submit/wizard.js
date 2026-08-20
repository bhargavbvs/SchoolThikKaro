// src/submit/wizard.js
//
// Three steps instead of one long scroll.
//
// The form asks for a school, a problem, and a photo. Presented as one
// page it reads as a wall — the reader cannot see how much is left, and
// the photo step, which needs the camera and the GPS, sits below the fold
// where nobody knows it is coming. Splitting it lets each screen ask one
// thing and lets the reader see how far along they are.

export const STEPS = [
  { key: 'school', label: 'Which school' },
  { key: 'problem', label: 'What is wrong' },
  { key: 'evidence', label: 'Photo & submit' },
];

/** The numbered progress bar. A completed step shows a tick rather than
 *  its number, so the reader can tell at a glance what is behind them. */
export function renderStepper(current) {
  const items = STEPS.map((s, i) => {
    const state = i < current ? 'done' : i === current ? 'now' : 'todo';
    const mark = state === 'done' ? '✓' : String(i + 1);
    return `<li class="step is-${state}">
      <span class="step-dot" aria-hidden="true">${mark}</span>
      <span class="step-label">${s.label}</span>
    </li>`;
  }).join('<li class="step-rule" aria-hidden="true"></li>');
  return `<ol class="stepper" aria-label="Progress">${items}</ol>`;
}

/** Which step a reader may move to.
 *
 *  Going back is always allowed — a reader who mistyped a school name must
 *  be able to fix it without losing the rest. Going forward is not, until
 *  the current step is satisfied, because the alternative is discovering at
 *  the end that something near the start was missing. */
export function canAdvance(step, state) {
  if (step === 0) return Boolean(state.schoolReady);
  if (step === 1) return Boolean(state.category && state.finding);
  return Boolean(state.hasPhoto && state.gateOpen);
}

/** What is still missing, in the reader's words, for the step they are on. */
export function blockingReason(step, state) {
  if (step === 0 && !state.schoolReady) return 'Enter the school’s name and its village or area.';
  if (step === 1) {
    if (!state.category) return 'Choose what the problem is with.';
    if (!state.finding) return 'Choose what you found.';
  }
  if (step === 2) {
    if (!state.hasPhoto) return 'A photo is required.';
    if (!state.gateOpen) return state.gateReason ?? 'The photo cannot be submitted yet.';
  }
  return null;
}

export function nextStep(step) { return Math.min(step + 1, STEPS.length - 1); }
export function prevStep(step) { return Math.max(step - 1, 0); }
export function isLast(step) { return step === STEPS.length - 1; }
