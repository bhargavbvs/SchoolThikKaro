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

  el.innerHTML = `<h1>Moderation queue</h1>
    <nav class="q-tabs" id="q-tabs">
      <button data-status="pending" class="is-on">Pending</button>
      <button data-status="approved">Approved</button>
      <button data-status="rejected">Rejected</button>
    </nav>
    <div id="stats"></div><div id="q">Loading\u2026</div>`;
  // Approving something used to make it disappear: the console only ever
  // asked for pending, so there was no way to see what had been published
  // or to undo a mistake.
  el.querySelector('#q-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-status]');
    if (!b) return;
    [...e.currentTarget.querySelectorAll('button')]
      .forEach((x) => x.classList.toggle('is-on', x === b));
    load(b.dataset.status);
  });
  // BOTH queues. school_submissions was invisible here until now, which
  // meant a citizen could report a school the government record misses and
  // no moderator would ever see it.
  const q = el.querySelector('#q');

  async function load(status) {
    q.textContent = 'Loading\u2026';
    // Newest first for anything already decided — the last thing acted on
    // is the one a moderator wants to check. Oldest first for pending,
    // because that is a queue.
    const order = status === 'pending' ? 'created_at.asc' : 'created_at.desc';
    const query = `review_status=eq.${status}&select=*&order=${order}`;
    const [rRes, sRes] = await Promise.all([
      api(`reports?${query}`), api(`school_submissions?${query}`),
    ]);
    if (rRes.status === 401 || sRes.status === 401) {
      return renderLogin(el, 'Session expired. Sign in again.');
    }
    const rows = [
      ...(await rRes.json()).map((r) => normaliseRow(r, 'reports')),
      ...(await sRes.json()).map((r) => normaliseRow(r, 'school_submissions')),
    ].sort((a, b) => (status === 'pending'
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at)));

    const s = summarise(rows);
    el.querySelector('#stats').textContent =
      `${s.total} ${status} \u00b7 ${s.verified} verified \u00b7 ${s.unblurred} unblurred`
      + (s.unlisted ? ` \u00b7 ${s.unlisted} not in the record` : '');
    q.innerHTML = renderQueueHTML(rows, status);
    // Photos are private now; each needs a short-lived signed URL minted
    // with the moderator's own session.
    signPhotos(q, sessionToken());
    return undefined;
  }
  await load('pending');

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
  const btn = el.querySelector('#send');
  btn.addEventListener('click', async () => {
    const email = el.querySelector('#email').value.trim();
    if (!email) return;
    btn.disabled = true;
    btn.textContent = 'Sending\u2026';
    try {
      await sendMagicLink(email);
      el.querySelector('#sent').hidden = false;
      btn.textContent = 'Link sent';
    } catch (err) {
      // This used to throw into nothing: the button sat there and the
      // moderator had no idea whether a link had been sent. The common
      // cause is an address with no account — create_user is false, so an
      // unknown email is refused rather than signed up.
      btn.disabled = false;
      btn.textContent = 'Send magic link';
      const warn = document.createElement('p');
      warn.className = 'warn';
      warn.textContent = 'Could not send a link to that address. '
        + 'Only an existing moderator account can sign in.';
      el.querySelector('#sent').before(warn);
    }
  });
}
