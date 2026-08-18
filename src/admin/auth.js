// src/admin/auth.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export async function sendMagicLink(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!res.ok) throw new Error('could not send link');
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
