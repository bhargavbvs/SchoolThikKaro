// src/submit/qr.js
import { iconEl } from './icons.js';

export function handoffURL(school, origin = window.location.origin) {
  return `${origin}/#/report/${school.udise}`;
}

/** Renders the QR as an <img> pointing at a self-contained data URL produced
 *  by the `qrcode` package at runtime. Import it lazily so the map bundle
 *  never pays for it. */
export function renderDesktopGateHTML(school, origin) {
  const url = handoffURL(school, origin);
  return `
    <div class="gate gate-camera">
      <span class="gate-badge">${iconEl('phone')}</span>
      <h3>Phone camera required</h3>
      <p>We need a live photo from your phone's rear camera to verify this
         report. Desktop uploads are not allowed.</p>
      <div class="qr-wrap"><img id="qr-img" alt="QR code to open this report on your phone" /></div>
      <p class="qr-url">${url}</p>
    </div>`;
}

export async function paintQR(el, url) {
  const QR = (await import('qrcode')).default;
  const dataUrl = await QR.toDataURL(url, { margin: 1, width: 220 });
  el.querySelector('#qr-img').src = dataUrl;
}
