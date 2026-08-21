// src/admin/admin.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { renderQueueHTML, summarise, normaliseRow, signPhotos } from './queue.js';
import { sendMagicLink, sessionToken, captureTokenFromHash } from './auth.js';

async function api(path, opts = {}) {
  const token = sessionToken();
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers ?? {}),
    },
  });
}

export async function mountAdmin(el) {
  captureTokenFromHash();
  if (!sessionToken()) return renderLogin(el);

  el.innerHTML = '<h1>Moderation queue</h1><div id="stats"></div><div id="q">Loading\u2026</div>';
  // BOTH queues. school_submissions was invisible here until now, which
  // meant a citizen could report a school the government record misses and
  // no moderator would ever see it.
  const query = 'review_status=eq.pending&select=*&order=created_at.asc';
  const [rRes, sRes] = await Promise.all([
    api(`reports?${query}`), api(`school_submissions?${query}`),
  ]);
  if (rRes.status === 401 || sRes.status === 401) {
    return renderLogin(el, 'Session expired. Sign in again.');
  }
  const rows = [
    ...(await rRes.json()).map((r) => normaliseRow(r, 'reports')),
    ...(await sRes.json()).map((r) => normaliseRow(r, 'school_submissions')),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const s = summarise(rows);
  el.querySelector('#stats').textContent =
    `${s.total} pending \u00b7 ${s.verified} verified \u00b7 ${s.unblurred} unblurred`
    + (s.unlisted ? ` \u00b7 ${s.unlisted} not in the record` : '');
  const q = el.querySelector('#q');
  q.innerHTML = renderQueueHTML(rows);
  // Photos are private now; each needs a short-lived signed URL minted
  // with the moderator's own session.
  signPhotos(q, sessionToken());

  q.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const action = btn.dataset.act;
    btn.disabled = true;

    // Patch the table the row actually came from: approving an unlisted
    // submission against `reports` would silently do nothing.
    const table = card.dataset.table || 'reports';
    await api(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ review_status: action === 'approve' ? 'approved' : 'rejected' }),
    });
    await api('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        actor_email: 'session', action, target_table: table, target_id: id,
      }),
    });
    card.remove();
  });
}

function renderLogin(el, msg = '') {
  el.innerHTML = `
    <h1>Moderator sign in</h1>
    ${msg ? `<p class="warn">${msg}</p>` : ''}
    <input id="email" type="email" placeholder="you@example.org" />
    <button id="send" type="button">Send magic link</button>
    <p id="sent" hidden>Check your email.</p>`;
  el.querySelector('#send').addEventListener('click', async () => {
    await sendMagicLink(el.querySelector('#email').value);
    el.querySelector('#sent').hidden = false;
  });
}
