// src/admin/queue.js
import { SUPABASE_URL } from '../config.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The bucket is private: a public URL 400s now. Cards render with the
// image blank and it is filled in by a signed URL once the moderator's
// session has been used to mint one — see signPhotos below.
const photoURL = () => '';

/** The two queues carry different identity fields — a report on a listed
 *  school has a UDISE code and a name from the government record; an
 *  unlisted-school submission has only what a citizen typed. Normalising
 *  here means the renderer and the moderator see one shape, while the
 *  table each row came from is preserved so approving it patches the right
 *  place. */
export function normaliseRow(row, table) {
  const unlisted = table === 'school_submissions';
  return {
    ...row,
    _table: table,
    _unlisted: unlisted,
    title: unlisted ? (row.submitted_name || 'Unnamed school') : row.school_name_snapshot,
    // Where it is: the citizen's own words for an unlisted school, the
    // UDISE code for one already in the record.
    where: unlisted
      ? [row.submitted_area, row.submitted_district].filter(Boolean).join(', ')
      : `UDISE ${row.udise_code ?? '—'}`,
  };
}

export function summarise(rows) {
  return {
    total: rows.length,
    verified: rows.filter((r) => r.tier === 'verified').length,
    unverified: rows.filter((r) => r.tier !== 'verified').length,
    unblurred: rows.filter((r) => !r.blur_applied).length,
    unlisted: rows.filter((r) => r._unlisted).length,
  };
}

export function renderQueueHTML(rows) {
  if (!rows.length) return '<p class="empty">The queue is empty.</p>';
  return rows.map((r) => `
    <article class="card" data-id="${esc(r.id)}" data-table="${esc(r._table ?? 'reports')}">
      <img data-path="${esc(r.image_path)}" alt="submitted photo" loading="lazy" />
      <div class="card-body">
        <h3>${esc(r.title)}</h3>
        <p class="where">${esc(r.where)}</p>
        <p class="badges">
          ${r._unlisted ? '<span class="b b-new">Not in the government record</span>' : ''}
          ${r.tier === 'verified'
            ? `<span class="b b-ok">Verified on-site</span> <span class="b">${Math.round(r.distance_m)}m</span>`
            : `<span class="b b-warn">Unverified</span>`}
          ${r.blur_applied ? '' : '<span class="b b-danger">Photo not blurred</span>'}
        </p>
        <p class="finding">${esc(r.category ?? 'girls_toilet')} \u00b7 ${esc(r.finding)} \u00b7 ${esc(new Date(r.created_at).toLocaleString())}</p>
        ${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
        <div class="actions">
          <button data-act="approve">Approve</button>
          <button data-act="reject">Reject</button>
        </div>
      </div>
    </article>`).join('');
}

/** Mints a signed URL for each card's photo, using the moderator's own
 *  session. The bucket is private, so this is the only way a photo is
 *  readable at all — and it expires, which a public URL never did. */
export async function signPhotos(root, token) {
  const imgs = [...root.querySelectorAll('img[data-path]')];
  await Promise.all(imgs.map(async (img) => {
    const path = img.dataset.path;
    if (!path) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/shaala-photos/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (!res.ok) return;
      const { signedURL } = await res.json();
      img.src = `${SUPABASE_URL}/storage/v1${signedURL}`;
    } catch { /* a photo that will not load is not worth breaking the queue for */ }
  }));
}
