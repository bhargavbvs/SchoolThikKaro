// src/admin/auth.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export async function sendMagicLink(email) {
  // redirect_to is sent explicitly rather than trusting the project's
  // Site URL, which was pointing at http://localhost:3000 — every magic
  // link would have landed on an address that does not exist. Naming it
  // here means the link works wherever this is deployed.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      create_user: false,
      options: { email_redirect_to: `${window.location.origin}/app/#/admin` },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`could not send link${detail ? `: ${detail.slice(0, 120)}` : ''}`);
  }
}

export function sessionToken() {
  const raw = localStorage.getItem('shaala.session');
  return raw ? JSON.parse(raw).access_token : null;
}

export function captureTokenFromHash() {
  const m = window.location.hash.match(/access_token=([^&]+)/);
  if (!m) return null;
  localStorage.setItem('shaala.session', JSON.stringify({ access_token: m[1] }));
  return m[1];
}
