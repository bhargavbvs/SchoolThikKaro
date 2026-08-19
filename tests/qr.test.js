// tests/qr.test.js
import { describe, it, expect } from 'vitest';
import { handoffURL, renderDesktopGateHTML } from '../src/submit/qr.js';

const school = { udise: '28133390196', name: 'ST.PETERS HS ANKP' };

describe('handoffURL', () => {
  it('deep-links to the report route for this exact school', () => {
    expect(handoffURL(school, 'https://shaala.in'))
      .toBe('https://shaala.in/app/#/report/28133390196');
  });
});

describe('renderDesktopGateHTML', () => {
  it('explains that a phone camera is required', () => {
    expect(renderDesktopGateHTML(school, 'https://shaala.in'))
      .toMatch(/phone camera/i);
  });
  it('states that desktop uploads are not allowed', () => {
    expect(renderDesktopGateHTML(school, 'https://shaala.in'))
      .toMatch(/not allowed/i);
  });
  it('embeds the handoff URL so the QR encodes the right target', () => {
    expect(renderDesktopGateHTML(school, 'https://shaala.in'))
      .toContain('https://shaala.in/app/#/report/28133390196');
  });
});
