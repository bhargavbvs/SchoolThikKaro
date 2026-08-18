// src/submit/api.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export function buildPayload(school, state) {
  return {
    udise_code: school.udise,
    school_name_snapshot: school.name,
    finding: state.finding,
    severity: state.severity ?? null,
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
