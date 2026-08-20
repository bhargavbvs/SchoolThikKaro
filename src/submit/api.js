// src/submit/api.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export function buildPayload(school, state) {
  // A school the UDISE+ release does not list goes to its own table, with
  // no udise_code and its identity carried as what the reporter typed.
  // Never merged into the report stream: every figure this site publishes
  // is the government's own record, and a citizen-submitted school has no
  // record behind it. See school_submissions in supabase/schema.sql.
  if (school.kind === 'unlisted') {
    return {
      kind: 'unlisted',
      submitted_name: school.name,
      submitted_area: school.area,
      submitted_district: school.district || null,
      submitted_state: school.state || null,
      udise_code: school.udise || null,
      category: state.categories?.[0] ?? state.category ?? null,
      categories: state.categories ?? (state.category ? [state.category] : []),
      finding: state.finding,
      severity: state.severity ?? null,
      note: state.note ?? null,
      // Structurally unverifiable — there is no recorded location to check
      // the reporter's fix against, so computeTier can only return this.
      tier: 'unverified',
      lat: state.fix?.lat ?? null,
      lng: state.fix?.lng ?? null,
      gps_accuracy_m: state.fix?.accuracyM ?? null,
      captured_at: new Date().toISOString(),
      blur_applied: Boolean(state.blurApplied),
      faces_found: state.facesFound ?? 0,
    };
  }
  return {
    udise_code: school.udise,
    school_name_snapshot: school.name,
    category: state.categories?.[0] ?? state.category ?? null,
    categories: state.categories ?? (state.category ? [state.category] : []),
    finding: state.finding,
    severity: state.severity ?? null,
    note: state.note ?? null,
    tier: state.tier?.tier ?? 'unverified',
    lat: state.fix?.lat ?? null,
    lng: state.fix?.lng ?? null,
    distance_m: state.tier?.distanceM ?? null,
    gps_accuracy_m: state.fix?.accuracyM ?? null,
    captured_at: new Date().toISOString(),
    blur_applied: Boolean(state.blurApplied),
    // The Edge Function refuses an unblurred photo that had faces in it, so
    // this count must be sent or that server-side check can never fire.
    faces_found: state.facesFound ?? 0,
  };
}

export async function submitReport({ school, state }) {
  const form = new FormData();
  form.append('meta', JSON.stringify(buildPayload(school, state)));
  form.append('photo', state.blob, 'report.jpg');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
  return res.json();
}
