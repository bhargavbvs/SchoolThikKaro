// src/submit/fix.js
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderFixHTML(school) {
  return `
    <h2>Report a fix</h2>
    <p>If the problem at <strong>${esc(school.name)}</strong> has been fixed,
       send evidence and we will update the pin.</p>
    <textarea id="fix-note" placeholder="What was done, and when?"></textarea>
    <input id="fix-photo" type="file" accept="image/*" capture="environment" />
    <button id="fix-send" type="button">Submit evidence</button>`;
}

export function renderDisputeHTML(school) {
  return `
    <h2>This record is wrong</h2>
    <p>Tell us why the record for <strong>${esc(school.name)}</strong> is
       incorrect. We review every dispute and correct the map when it holds.</p>
    <textarea id="dis-reason" placeholder="Why is this record wrong?"></textarea>
    <input id="dis-contact" type="text" placeholder="Contact (optional)" />
    <button id="dis-send" type="button">Submit dispute</button>`;
}

export function buildFixPayload(school, state) {
  return { udise_code: school.udise, note: state.note ?? null,
           image_path: state.imagePath ?? null };
}

export function buildDisputePayload(school, state) {
  return { udise_code: school.udise, reason: state.reason,
           contact: state.contact ?? null };
}
