import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Serves the photo for ONE approved report.
//
// The bucket is private, because an unmoderated photo was previously
// fetchable by anyone from the moment it uploaded. Publishing an approved
// one therefore has to be a deliberate act rather than a side effect of
// the bucket being open — this is that act, and it is the only way a
// photo reaches the public.
//
// It checks approval on every request rather than handing out a lasting
// URL: a report taken down stops being visible immediately, which is what
// "take it down" has to mean.

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: CORS });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return new Response('id required', { status: 400, headers: CORS });

  // Look in both tables; a report and an unlisted-school submission are
  // different records and either may be approved.
  let path: string | null = null;
  for (const table of ['reports', 'school_submissions']) {
    const { data } = await admin.from(table)
      .select('image_path')
      .eq('id', id).eq('review_status', 'approved').maybeSingle();
    if (data?.image_path) { path = data.image_path; break; }
  }
  // Not approved and not found are answered identically, so this cannot be
  // used to discover which ids exist and are merely pending.
  if (!path) return new Response('not found', { status: 404, headers: CORS });

  const { data: signed, error } = await admin.storage
    .from('shaala-photos').createSignedUrl(path, 300);
  if (error || !signed) return new Response('unavailable', { status: 503, headers: CORS });

  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: signed.signedUrl, 'Cache-Control': 'public, max-age=240' },
  });
});
