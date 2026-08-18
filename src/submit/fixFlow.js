import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { normaliseImage, toJpegBlob } from './blur.js';
import { renderFixHTML, renderDisputeHTML, buildFixPayload, buildDisputePayload } from './fix.js';
import { iconEl } from './icons.js';

const doneHTML = (message) => `<div class="done">
  <span class="done-badge">${iconEl('checkCircle')}</span>
  <h2>Thank you</h2>
  <p>${message}</p>
</div>`;

export { buildFixPayload, buildDisputePayload };

/** Fix photos live under fixes/ specifically so the storage RLS policy can
 *  scope anon writes to that prefix and nowhere else in the bucket. */
export function fixPhotoPath(udise, id) {
  return `fixes/${udise}/${id}.jpg`;
}

async function uploadFixPhoto(udise, blob) {
  const path = fixPhotoPath(udise, crypto.randomUUID());
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/shaala-photos/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw new Error('fix photo upload failed');
  return path;
}

async function insertRow(table, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${table} submit failed: ${res.status}`);
  return res.json();
}

export function openFixFlow(school) {
  const root = document.getElementById('submit-root');
  root.hidden = false;
  root.innerHTML = `<button id="flow-close" type="button" aria-label="Close">${iconEl('x')}</button>${renderFixHTML(school)}`;

  let photoBlob = null;
  root.querySelector('#fix-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) { photoBlob = null; return; }
    const bitmap = await createImageBitmap(file);
    const { canvas } = normaliseImage(bitmap);
    photoBlob = await toJpegBlob(canvas, 0.8);
  });

  root.querySelector('#fix-send').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const note = root.querySelector('#fix-note').value.trim();
    let imagePath = null;
    if (photoBlob) imagePath = await uploadFixPhoto(school.udise, photoBlob);
    await insertRow('fixes', buildFixPayload(school, { note, imagePath }));
    root.innerHTML = doneHTML('Your fix report is queued for review.');
  });

  root.querySelector('#flow-close').addEventListener('click', () => {
    root.hidden = true; root.innerHTML = '';
  });
}

export function openDisputeFlow(school) {
  const root = document.getElementById('submit-root');
  root.hidden = false;
  root.innerHTML = `<button id="flow-close" type="button" aria-label="Close">${iconEl('x')}</button>${renderDisputeHTML(school)}`;

  root.querySelector('#dis-send').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const reason = root.querySelector('#dis-reason').value.trim();
    const contact = root.querySelector('#dis-contact').value.trim();
    await insertRow('disputes', buildDisputePayload(school, { reason, contact: contact || null }));
    root.innerHTML = doneHTML('Your dispute is queued for review.');
  });

  root.querySelector('#flow-close').addEventListener('click', () => {
    root.hidden = true; root.innerHTML = '';
  });
}
