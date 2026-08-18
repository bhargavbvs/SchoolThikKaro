// src/admin/queue.js
import { SUPABASE_URL } from '../config.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const photoURL = (p) => `${SUPABASE_URL}/storage/v1/object/public/shaala-photos/${p}`;

export function summarise(rows) {
  return {
    total: rows.length,
    verified: rows.filter((r) => r.tier === 'verified').length,
    unverified: rows.filter((r) => r.tier !== 'verified').length,
    unblurred: rows.filter((r) => !r.blur_applied).length,
  };
}

export function renderQueueHTML(rows) {
  if (!rows.length) return '<p class="empty">The queue is empty.</p>';
  return rows.map((r) => `
    <article class="card" data-id="${esc(r.id)}">
      <img src="${esc(photoURL(r.image_path))}" alt="submitted photo" loading="lazy" />
      <div class="card-body">
        <h3>${esc(r.school_name_snapshot)}</h3>
        <p class="badges">
          ${r.tier === 'verified'
            ? `<span class="b b-ok">Verified on-site</span> <span class="b">${Math.round(r.distance_m)}m</span>`
            : `<span class="b b-warn">Unverified</span>`}
          ${r.blur_applied ? '' : '<span class="b b-danger">Photo not blurred</span>'}
        </p>
        <p class="finding">${esc(r.finding)} \u00b7 ${esc(new Date(r.created_at).toLocaleString())}</p>
        <div class="actions">
          <button data-act="approve">Approve</button>
          <button data-act="reject">Reject</button>
        </div>
      </div>
    </article>`).join('');
}
