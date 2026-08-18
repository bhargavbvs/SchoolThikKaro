import { VERIFIED_RADIUS_M } from '../config.js';

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isVerifiedDistance(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return false;
  return meters <= VERIFIED_RADIUS_M;
}
