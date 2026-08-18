// src/admin/admin.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { renderQueueHTML, summarise } from './queue.js';
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
  const res = await api('reports?review_status=eq.pending&select=*&order=created_at.asc');
  if (res.status === 401) return renderLogin(el, 'Session expired. Sign in again.');
  const rows = await res.json();

  const s = summarise(rows);
  el.querySelector('#stats').textContent =
    `${s.total} pending \u00b7 ${s.verified} verified \u00b7 ${s.unblurred} unblurred`;
  const q = el.querySelector('#q');
  q.innerHTML = renderQueueHTML(rows);

  q.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const action = btn.dataset.act;
    btn.disabled = true;

    await api(`reports?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ review_status: action === 'approve' ? 'approved' : 'rejected' }),
    });
    await api('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        actor_email: 'session', action, target_table: 'reports', target_id: id,
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
