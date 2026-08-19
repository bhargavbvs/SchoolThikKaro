import { describe, it, expect } from 'vitest';
import { deriveIssues, teacherCount, ISSUE_LABELS, parseSchoolResponse, stripPersonal }
  from '../scripts/lib/school-detail.mjs';

// The genuine API response for MPPS Vedurupattu Rajupalem (28194403102),
// captured live. Kept verbatim so the field semantics this module depends
// on are pinned to something real rather than to my reading of them.
const REAL_FACILITY = {
  bldStatus: '3-Government', bndrywallType: '1-Pucca', clsrmsInst: 1,
  clsrmsMaj: 0, clsrmsMajPpu: 1, clsrmsMajKuc: 0, clsrmsMajTnt: 0,
  toiletYn: 2, toiletb: 0, toiletbFun: 0, toiletg: 0, toiletgFun: 0,
  toiletbCwsnFun: 0, toiletgCwsnFun: 0,
  handwashYn: 2, handwashYnDesc: '2-No',
  drinkWaterYn: 1, drinkWaterYnDesc: '1-Yes',
  electricityYn: 1, libraryYn: 1, playgroundYn: 1, rampsYn: 1, internetYn: 1,
};
const REAL_TEACHERS = {
  totalBoy: 8, totalGirl: 3, totalCount: 11,
  totalTeacherCon: 0, totalTeacherReg: 0, totalTeacherMale: 1, totalTeacherFemale: 0,
};

describe('deriveIssues on a real school record', () => {
  const { issues, unknown } = deriveIssues(REAL_FACILITY, REAL_TEACHERS);

  it('finds the toilet failure the site already publishes', () => {
    expect(issues).toContain('no_girls_toilet');
  });
  it('finds what the toilet-only view could never show', () => {
    expect(issues).toContain('single_teacher');
    expect(issues).toContain('no_female_teacher');
    expect(issues).toContain('no_handwashing');
    expect(issues).toContain('classroom_major_repair');
  });
  it('does not invent problems the record says are fine', () => {
    for (const ok of ['no_drinking_water', 'no_electricity', 'no_library',
      'no_playground', 'no_ramp']) expect(issues).not.toContain(ok);
  });
  it('has nothing unknown for a complete record', () => {
    expect(unknown).toEqual([]);
  });
});

describe('a missing field is never published as a failure', () => {
  it('reports an absent field as unknown, not as a problem', () => {
    const { issues, unknown } = deriveIssues({ electricityYn: 1 }, null);
    expect(issues).not.toContain('no_drinking_water');
    expect(unknown).toContain('no_drinking_water');
  });
  it('treats a value that is neither yes nor no as unknown', () => {
    // 0 and null both appear in the real data for "not reported".
    const { issues, unknown } = deriveIssues({ drinkWaterYn: 0 }, null);
    expect(issues).not.toContain('no_drinking_water');
    expect(unknown).toContain('no_drinking_water');
  });
  it('says nothing about teachers when the teacher call failed', () => {
    const { issues, unknown } = deriveIssues(REAL_FACILITY, null);
    expect(issues).not.toContain('single_teacher');
    expect(unknown).toContain('single_teacher');
  });
});

describe('teacherCount', () => {
  it('counts by gender, not by employment type', () => {
    // This real school reports 1 male / 0 female but 0 regular / 0
    // contract — the employment split cannot be trusted as a total.
    expect(teacherCount(REAL_TEACHERS)).toBe(1);
  });
  it('returns null when the record carries no teacher figures at all', () => {
    expect(teacherCount({})).toBeNull();
    expect(teacherCount(null)).toBeNull();
  });
  it('distinguishes a school with no teacher from one with one teacher', () => {
    expect(deriveIssues(null, { totalTeacherMale: 0, totalTeacherFemale: 0 }).issues)
      .toContain('no_teacher');
    expect(deriveIssues(null, { totalTeacherMale: 0, totalTeacherFemale: 0 }).issues)
      .not.toContain('single_teacher');
  });
});

describe('parseSchoolResponse', () => {
  it('returns the data block on success', () => {
    expect(parseSchoolResponse({ status: true, data: { a: 1 } })).toEqual({ a: 1 });
  });
  it('returns null for an error response rather than throwing mid-crawl', () => {
    expect(parseSchoolResponse({ status: false })).toBeNull();
    expect(parseSchoolResponse(null)).toBeNull();
    expect(parseSchoolResponse({ status: true })).toBeNull();
  });
});

describe('ISSUE_LABELS', () => {
  it('has a plain-language label for every issue that can be reported', () => {
    const { issues } = deriveIssues(REAL_FACILITY, REAL_TEACHERS);
    for (const key of issues) {
      expect(ISSUE_LABELS[key], `no label for ${key}`).toBeTruthy();
      expect(ISSUE_LABELS[key]).not.toMatch(/Yn|Per|tot[A-Z]/);
    }
  });
});

describe('stripPersonal', () => {
  // The real profile response names an individual government employee.
  const REAL_PROFILE = {
    address: 'VEDURUPATTU RAJUPALEM', estdYear: '1988',
    headMasterName: 'K Venkateswarlu ', respName: 'K VENKATESWARLU',
    email: 'mppsvedurupatturajupalem102@gmail.com', schPhone: null,
    mediumOfInstrName1: '17-Telugu', minorityYn: 2,
  };

  it('drops the named individuals the API returns', () => {
    const out = stripPersonal(REAL_PROFILE);
    expect(out).not.toHaveProperty('headMasterName');
    expect(out).not.toHaveProperty('respName');
    expect(JSON.stringify(out)).not.toMatch(/Venkateswarlu/i);
  });

  it('drops direct contact details too', () => {
    const out = stripPersonal(REAL_PROFILE);
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('schPhone');
  });

  it('keeps everything about the school itself', () => {
    const out = stripPersonal(REAL_PROFILE);
    expect(out.address).toBe('VEDURUPATTU RAJUPALEM');
    expect(out.estdYear).toBe('1988');
    expect(out.mediumOfInstrName1).toBe('17-Telugu');
  });

  it('passes a failed call through without throwing', () => {
    expect(stripPersonal(null)).toBeNull();
    expect(stripPersonal(undefined)).toBeUndefined();
  });
});
