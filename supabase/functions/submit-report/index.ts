import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_BYTES = 3 * 1024 * 1024;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get('IP_SALT') ?? '';
  const buf = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A browser sends OPTIONS before any POST carrying an Authorization
// header. This function answered that with 405 and no CORS headers, so
// every submission from a phone or a laptop was blocked before the
// request left the device — which is why the button sat on "Submitting…"
// forever. curl never sends a preflight, so nothing caught it here.
//
// The origin is open because this endpoint is public-write by design:
// anyone can already reach it with curl, and what protects it is the rate
// limit, the size cap, the jpeg check and the unblurred-photo refusal —
// not the origin header.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Max-Age': '86400',
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const ipHash = await hashIp(ip);

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  // Counts BOTH tables against one budget. Counting only `reports` would
  // hand every client a second, full allowance on school_submissions.
  const [reported, submitted] = await Promise.all([
    admin.from('reports').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('created_at', since),
    admin.from('school_submissions').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('created_at', since),
  ]);
  const count = (reported.count ?? 0) + (submitted.count ?? 0);
  if (count >= MAX_PER_WINDOW) {
    return json({ error: 'rate limited' }, 429);
  }

  const form = await req.formData();
  const meta = JSON.parse(String(form.get('meta')));
  const photo = form.get('photo') as File | null;

  if (!photo) return json({ error: 'photo required' }, 400);
  if (photo.size > MAX_BYTES) {
    return json({ error: 'photo too large' }, 413);
  }
  if (photo.type !== 'image/jpeg') {
    return json({ error: 'jpeg only' }, 415);
  }
  // The client cannot be trusted to have blurred. A false value is refused
  // outright; a true value is still checked by a human before publication.
  if (meta.blur_applied !== true && (meta.faces_found ?? 0) > 0) {
    return json({ error: 'unblurred photo refused' }, 400);
  }

  // A school the UDISE+ release does not list has no code to file under.
  const unlisted = meta.kind === 'unlisted';
  if (unlisted && !String(meta.submitted_name ?? '').trim()) {
    return json({ error: 'school name required' }, 400);
  }
  const path = unlisted
    ? `unlisted/${crypto.randomUUID()}.jpg`
    : `${meta.udise_code}/${crypto.randomUUID()}.jpg`;
  const up = await admin.storage.from('shaala-photos')
    .upload(path, photo, { contentType: 'image/jpeg' });
  if (up.error) {
    return json({ error: up.error.message }, 500);
  }

  // `kind` is a routing flag for this function, not a column on either
  // table — strip it before the insert or Postgres rejects the row.
  const { kind: _kind, ...row } = meta;
  const { data, error } = await admin.from(unlisted ? 'school_submissions' : 'reports').insert({
    ...row, image_path: path, ip_hash: ipHash, review_status: 'pending',
  }).select('id').single();

  if (error) return json({ error: error.message }, 500);
  return json({ id: data.id }, 201);
});
