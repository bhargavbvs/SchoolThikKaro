// Turning a school's UDISE+ facility and teacher record into the short list
// of things that are actually wrong with it.
//
// Pure and side-effect free. The crawler stores raw API responses; every
// judgement about what counts as a problem is made here, so it can be
// argued with, tested, and changed without re-crawling 78,744 schools.

/** UDISE+ encodes yes/no as 1/2 — confirmed by the API's own paired
 *  description fields ("1-Yes", "2-No"). Anything else (0, null, missing)
 *  is unknown, and unknown is NOT a problem: we report what the record
 *  says, never what its absence might imply. */
export const YES = 1;
export const NO = 2;

const isNo = (v) => v === NO;

/** Every issue we can read off a school's own record.
 *
 *  `has` is deliberately three-valued — true, false, or null for "the
 *  record does not say". A school missing a field must never be published
 *  as though it failed. */
export const ISSUE_CHECKS = [
  { key: 'no_girls_toilet', label: 'No working toilet for girls',
    read: (f) => (f.toiletg == null ? null : !(f.toiletg > 0 && f.toiletgFun > 0)) },
  { key: 'no_boys_toilet', label: 'No working toilet for boys',
    read: (f) => (f.toiletb == null ? null : !(f.toiletb > 0 && f.toiletbFun > 0)) },
  { key: 'no_accessible_toilet', label: 'No accessible toilet for disabled children',
    read: (f) => (f.toiletgCwsnFun == null && f.toiletbCwsnFun == null ? null
      : !(f.toiletgCwsnFun > 0 || f.toiletbCwsnFun > 0)) },
  { key: 'no_drinking_water', label: 'No drinking water', read: (f) => yn(f.drinkWaterYn) },
  { key: 'no_handwashing', label: 'Nowhere to wash hands', read: (f) => yn(f.handwashYn) },
  { key: 'no_electricity', label: 'No electricity', read: (f) => yn(f.electricityYn) },
  { key: 'no_library', label: 'No library', read: (f) => yn(f.libraryYn) },
  { key: 'no_playground', label: 'No playground', read: (f) => yn(f.playgroundYn) },
  { key: 'no_ramp', label: 'No ramp for disabled children', read: (f) => yn(f.rampsYn) },
  { key: 'classroom_major_repair', label: 'A classroom needs major repair',
    read: (f) => majorRepair(f) },
];

function yn(v) {
  if (v === YES) return false;
  if (isNo(v)) return true;
  return null;
}

function majorRepair(f) {
  const parts = [f.clsrmsMaj, f.clsrmsMajPpu, f.clsrmsMajKuc, f.clsrmsMajTnt];
  if (parts.every((p) => p == null)) return null;
  return parts.some((p) => (p ?? 0) > 0);
}

/** Headcount from the teacher record.
 *
 *  Male + female, not regular + contract: the same real school reports
 *  1 male / 0 female while reporting 0 regular / 0 contract, so the
 *  employment split cannot be trusted as a total. */
export function teacherCount(t) {
  if (!t) return null;
  const m = t.totalTeacherMale;
  const f = t.totalTeacherFemale;
  if (typeof m !== 'number' && typeof f !== 'number') return null;
  return (m ?? 0) + (f ?? 0);
}

export const TEACHER_CHECKS = [
  { key: 'no_teacher', label: 'No teacher at all',
    read: (t) => { const n = teacherCount(t); return n === null ? null : n === 0; } },
  { key: 'single_teacher', label: 'Only one teacher for the whole school',
    read: (t) => { const n = teacherCount(t); return n === null ? null : n === 1; } },
  { key: 'no_female_teacher', label: 'No female teacher',
    read: (t) => (typeof t?.totalTeacherFemale === 'number' ? t.totalTeacherFemale === 0 : null) },
];

/** The issues a school's own record shows, as a list of keys.
 *
 *  Only positives are returned: an issue absent from the list is either
 *  fine or unrecorded, and the two are distinguished by `unknown`. */
export function deriveIssues(facility, teachers) {
  const issues = [];
  const unknown = [];
  for (const c of ISSUE_CHECKS) {
    const v = facility ? c.read(facility) : null;
    if (v === true) issues.push(c.key);
    else if (v === null) unknown.push(c.key);
  }
  for (const c of TEACHER_CHECKS) {
    const v = teachers ? c.read(teachers) : null;
    if (v === true) issues.push(c.key);
    else if (v === null) unknown.push(c.key);
  }
  return { issues, unknown };
}

/** Human label for an issue key, for rendering. */
export const ISSUE_LABELS = Object.fromEntries(
  [...ISSUE_CHECKS, ...TEACHER_CHECKS].map((c) => [c.key, c.label]));

/** Pulls the fields we keep out of a raw API response, or null when the
 *  call did not succeed. Never throws — one bad school must not abort a
 *  two-hour crawl. */
export function parseSchoolResponse(json) {
  if (!json?.status || !json?.data) return null;
  return json.data;
}

/** Fields the UDISE+ profile returns that name or contact a person.
 *
 *  headMasterName and respName are individual government employees. The
 *  spec forbids naming staff anywhere on this site, and the safest form of
 *  that rule is never to hold the data: this runs at ingestion, so the
 *  names are dropped before anything touches disk rather than filtered at
 *  render time by code someone might later forget to call.
 *
 *  The contact fields go with them. A school inbox and phone number are
 *  arguably institutional, but on a site that invites the public to act on
 *  what it publishes, printing a direct line to one named person turns
 *  accountability into harassment. Anyone with a legitimate need can get
 *  them from UDISE+ itself. */
export const PERSONAL_FIELDS = [
  'headMasterName', 'respName', 'email', 'schPhone', 'mobileNo', 'contactNo',
];

/** Returns a copy with every personal field removed. Null-safe, so a failed
 *  API call passes through untouched. */
export function stripPersonal(record) {
  if (!record || typeof record !== 'object') return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (!PERSONAL_FIELDS.includes(k)) out[k] = v;
  }
  return out;
}
