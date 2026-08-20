import { describe, it, expect } from 'vitest';
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
