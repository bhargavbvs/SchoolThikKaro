import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STEPS, renderStepper, canAdvance, blockingReason, nextStep, prevStep, isLast }
  from '../src/submit/wizard.js';

describe('renderStepper', () => {
  it('marks the step the reader is on', () => {
    expect(renderStepper(1)).toMatch(/class="step is-now"[\s\S]*?What is wrong/);
  });
  it('ticks the steps already behind them', () => {
    const html = renderStepper(2);
    expect(html).toMatch(/is-done/);
    expect(html).toContain('✓');
  });
  it('shows a number for steps not yet reached', () => {
    expect(renderStepper(0)).toMatch(/is-todo[\s\S]*?>2</);
  });
  it('names every step, so the reader knows what is coming', () => {
    const html = renderStepper(0);
    for (const s of STEPS) expect(html).toContain(s.label);
  });
});

describe('canAdvance', () => {
  it('will not leave the school step without a school', () => {
    expect(canAdvance(0, {})).toBe(false);
    expect(canAdvance(0, { schoolReady: true })).toBe(true);
  });
  it('will not leave the problem step until both answers are given', () => {
    expect(canAdvance(1, { category: 'drinking_water' })).toBe(false);
    expect(canAdvance(1, { category: 'drinking_water', finding: 'absent' })).toBe(true);
  });
  it('will not submit without a photo that passed the blur gate', () => {
    expect(canAdvance(2, { hasPhoto: true, gateOpen: false })).toBe(false);
    expect(canAdvance(2, { hasPhoto: false, gateOpen: true })).toBe(false);
    expect(canAdvance(2, { hasPhoto: true, gateOpen: true })).toBe(true);
  });
});

describe('blockingReason', () => {
  it('says what is missing rather than just refusing', () => {
    expect(blockingReason(0, {})).toMatch(/name and its village/i);
    expect(blockingReason(1, {})).toMatch(/what the problem is with/i);
    expect(blockingReason(1, { category: 'x' })).toMatch(/what you found/i);
    expect(blockingReason(2, {})).toMatch(/photo is required/i);
  });
  it('passes through the blur gate’s own reason, which is the specific one', () => {
    const r = blockingReason(2, { hasPhoto: true, gateOpen: false, gateReason: 'Faces were found and not blurred.' });
    expect(r).toBe('Faces were found and not blurred.');
  });
  it('is null when nothing is blocking', () => {
    expect(blockingReason(1, { category: 'x', finding: 'y' })).toBeNull();
  });
});

describe('navigation', () => {
  it('never runs past the last step or before the first', () => {
    expect(nextStep(2)).toBe(2);
    expect(prevStep(0)).toBe(0);
  });
  it('knows the last step, which submits rather than continuing', () => {
    expect(isLast(2)).toBe(true);
    expect(isLast(0)).toBe(false);
  });
});

describe('only one action is offered per step', () => {
  const css = readFileSync('src/submit/style-submit.css', 'utf8');

  it('lets the hidden attribute win over any display rule', () => {
    // #sub-send sets display:flex, which outranks [hidden] — so the submit
    // button rendered beside Next on step one. The guard is global because
    // the next rule to do this will not be that one.
    expect(css).toMatch(/#submit-root \[hidden\] \{ display:none !important; \}/);
  });

  it('does not push a lone Next against the left edge', () => {
    // With Back and Submit both hidden, space-between left Next stranded.
    const nav = css.match(/\.sub-nav \{[^}]*\}/)[0];
    expect(nav).toContain('justify-content:flex-end');
    expect(css).toMatch(/\.sub-nav #sub-back \{ margin-right:auto; \}/);
  });
});

describe('form controls match the rest of the site', () => {
  const css = readFileSync('src/submit/style-submit.css', 'utf8');

  it('has no rounded corners except genuine circles', () => {
    // The ledger pages are square throughout; the form was the only place
    // with rounded corners. 50% is kept for the stepper dots.
    const radii = css.match(/border-radius:[^;]*/g) ?? [];
    for (const r of radii) expect(r).toContain('50%');
  });

  it('names the field font instead of inheriting it', () => {
    // `font:inherit` on a form control is unreliable, and the fields were
    // rendering in the browser's own face beside labels using the site's.
    expect(css).toMatch(/font:400 15px\/1\.4 var\(--sans\)/);
    expect(css).toMatch(/::placeholder[^}]*font-family:var\(--sans\)/);
  });
});

describe('the whole app is square, not just the form', () => {
  it('leaves no rounded corners in any app stylesheet except circles', () => {
    // The map and admin chrome kept their own radii after the form was
    // squared, so /app/ was half one shape and half the other.
    for (const f of ['src/submit/style-submit.css', 'src/map/style-map.css',
      'src/admin/style-admin.css', 'src/style.css']) {
      for (const r of readFileSync(f, 'utf8').match(/border-radius:[^;]*/g) ?? []) {
        expect(r, `${f}: ${r}`).toContain('50%');
      }
    }
  });
});

describe('fieldsets', () => {
  it('clears the default border on every one, not a named few', () => {
    // A fieldset's default border draws a box with the legend notched into
    // its top edge. Two were cleared by name and two were not, so half the
    // step had boxes around it and half did not.
    const css = readFileSync('src/submit/style-submit.css', 'utf8');
    expect(css).toMatch(/#submit-root fieldset \{[^}]*border:0/);
  });
});

describe('a device that cannot finish the report', () => {
  const src = readFileSync('src/submit/addSchool.js', 'utf8');

  it('does not offer a submit button it can never enable', () => {
    // On desktop mountCapture never runs, so nothing ever attached a
    // click handler to #sub-send. It rendered permanently disabled with
    // nothing saying why, and the flow simply stopped there.
    expect(src).toMatch(/send\.hidden = !isLast\(step\) \|\| capture\.handoff/);
  });

  it('hands the job to the phone instead of dead-ending', () => {
    expect(src).toMatch(/capture\.handoff = true/);
    expect(src).toMatch(/paintQR/);
    expect(src).toMatch(/window\.location\.href/);
  });

  it('says why the step cannot happen here', () => {
    expect(src).toMatch(/photo taken at the school and the location/);
  });
});
