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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

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
    return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
  }

  const form = await req.formData();
  const meta = JSON.parse(String(form.get('meta')));
  const photo = form.get('photo') as File | null;

  if (!photo) return new Response(JSON.stringify({ error: 'photo required' }), { status: 400 });
  if (photo.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'photo too large' }), { status: 413 });
  }
  if (photo.type !== 'image/jpeg') {
    return new Response(JSON.stringify({ error: 'jpeg only' }), { status: 415 });
  }
  // The client cannot be trusted to have blurred. A false value is refused
  // outright; a true value is still checked by a human before publication.
  if (meta.blur_applied !== true && (meta.faces_found ?? 0) > 0) {
    return new Response(JSON.stringify({ error: 'unblurred photo refused' }), { status: 400 });
  }

  // A school the UDISE+ release does not list has no code to file under.
  const unlisted = meta.kind === 'unlisted';
  if (unlisted && !String(meta.submitted_name ?? '').trim()) {
    return new Response(JSON.stringify({ error: 'school name required' }), { status: 400 });
  }
  const path = unlisted
    ? `unlisted/${crypto.randomUUID()}.jpg`
    : `${meta.udise_code}/${crypto.randomUUID()}.jpg`;
  const up = await admin.storage.from('shaala-photos')
    .upload(path, photo, { contentType: 'image/jpeg' });
  if (up.error) {
    return new Response(JSON.stringify({ error: up.error.message }), { status: 500 });
  }

  // `kind` is a routing flag for this function, not a column on either
  // table — strip it before the insert or Postgres rejects the row.
  const { kind: _kind, ...row } = meta;
  const { data, error } = await admin.from(unlisted ? 'school_submissions' : 'reports').insert({
    ...row, image_path: path, ip_hash: ipHash, review_status: 'pending',
  }).select('id').single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ id: data.id }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
});
