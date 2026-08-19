// src/submit/gps.js
import { haversineMeters, isVerifiedDistance } from '../lib/geo.js';
import { VERIFIED_RADIUS_M } from '../config.js';

export function computeTier({ schoolLat, schoolLng, fixLat, fixLng, accuracyM, source }) {
  if (source !== 'camera') {
    return { tier: 'unverified', distanceM: null,
      reason: 'Uploaded from gallery — we cannot confirm where or when it was taken.' };
  }
  // A school the government has no record of has no recorded location to
  // stand near, so the distance check cannot mean anything. Such a report
  // is always unverified — the reporter's own fix is the only claim about
  // where the school is, and one claim cannot corroborate itself.
  if (schoolLat == null || schoolLng == null) {
    return { tier: 'unverified', distanceM: null,
      reason: 'This school is not in the government record, so we cannot check your location against it.' };
  }
  if (fixLat == null || fixLng == null) {
    return { tier: 'unverified', distanceM: null,
      reason: 'No location fix was available at capture.' };
  }
  if (typeof accuracyM === 'number' && accuracyM > VERIFIED_RADIUS_M) {
    return { tier: 'unverified', distanceM: null,
      reason: `Location was not accurate enough (±${Math.round(accuracyM)}m).` };
  }
  const distanceM = haversineMeters(schoolLat, schoolLng, fixLat, fixLng);
  if (!isVerifiedDistance(distanceM)) {
    return { tier: 'unverified', distanceM,
      reason: `You were too far from the school (${Math.round(distanceM)}m away).` };
  }
  return { tier: 'verified', distanceM, reason: null };
}

export function getFix(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 });
  });
}

export function detectPlatform(ua = navigator.userAgent) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function permissionHelpHTML(platform) {
  if (platform === 'ios') {
    return `<ol>
      <li>Open <strong>Settings</strong></li>
      <li>Scroll to your browser, tap it</li>
      <li>Tap <strong>Location</strong> and choose <strong>While Using the App</strong></li>
      <li>Return here and tap Try Again</li></ol>`;
  }
  if (platform === 'android') {
    return `<ol>
      <li>Tap the lock icon in the address bar</li>
      <li>Tap <strong>Permissions</strong></li>
      <li>Turn <strong>Location</strong> on</li>
      <li>Tap Try Again</li></ol>`;
  }
  return `<p>Open this page on your phone to report.</p>`;
}
