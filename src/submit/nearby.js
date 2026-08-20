// src/submit/nearby.js
//
// "Which school are you at?"
//
// The UDISE+ release only lets us enumerate the 78,744 schools already
// flagged for a girls' toilet — about one in eighteen. Reporting must work
// for the other seventeen, so the picker asks three sources in order of how
// much they can be trusted, and always leaves the reader a way past all of
// them:
//
//   1. our own records, which carry a UDISE code and the government's data
//   2. OpenStreetMap, which is free and needs no key, but is thin in rural
//      India — 5km around Hingoli returns seven schools, the first a
//      private international one
//   3. whatever the reader types, which is the only source that always works
//
// A school found by 2 or 3 is not in the government record and is marked as
// such all the way through: it goes to school_submissions, never into the
// published figures.

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Metres between two lat/lngs. */
export function distanceM(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Overpass QL for schools around a point. Nodes and ways both, because a
 *  school mapped as a building footprint is a way, and asking only for
 *  nodes silently loses most of the urban ones. */
export function overpassQuery(lat, lng, radiusM = 1500) {
  const at = `${radiusM},${lat},${lng}`;
  return `[out:json][timeout:20];(`
    + `node(around:${at})[amenity=school];`
    + `way(around:${at})[amenity=school];`
    + `);out center 60;`;
}

/** Overpass elements -> the shape the picker renders. Unnamed entries are
 *  dropped: "school" with no name tells a reader nothing and cannot be
 *  moderated later. */
export function fromOverpass(json, lat, lng) {
  const els = json?.elements ?? [];
  return els
    .map((e) => {
      const p = e.center ?? e;
      if (!e.tags?.name || typeof p.lat !== 'number') return null;
      return {
        source: 'osm',
        id: `osm:${e.type}/${e.id}`,
        name: e.tags.name,
        area: e.tags['addr:village'] ?? e.tags['addr:suburb'] ?? e.tags['addr:city'] ?? '',
        lat: p.lat,
        lng: p.lon,
        distanceM: Math.round(distanceM(lat, lng, p.lat, p.lon)),
      };
    })
    .filter(Boolean);
}

/** Our own records -> the same shape, flagged as government-recorded. */
export function fromUdise(schools, lat, lng) {
  return (schools ?? []).map((s) => ({
    source: 'udise',
    id: `udise:${s.udise}`,
    udise: s.udise,
    name: s.name,
    area: [s.block, s.district].filter(Boolean).join(', '),
    lat: s.lat,
    lng: s.lng,
    distanceM: Math.round(s.distanceM ?? distanceM(lat, lng, s.lat, s.lng)),
  }));
}

/** Merges the sources, nearest first, dropping an OSM entry that is plainly
 *  the same place as one we already hold.
 *
 *  A UDISE record always wins the duplicate: it carries the code, the
 *  government's own data, and a page on this site. */
export function mergeCandidates(udise, osm, { sameWithinM = 150 } = {}) {
  const key = (s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const seen = udise.map((s) => ({ k: key(s), lat: s.lat, lng: s.lng }));
  const kept = osm.filter((o) => !seen.some((u) =>
    u.k === key(o) && distanceM(u.lat, u.lng, o.lat, o.lng) <= sameWithinM));
  return [...udise, ...kept].sort((a, b) => a.distanceM - b.distanceM);
}

/** Schools near a point, best-effort. Never throws: a picker that fails
 *  closed would leave the reader with no way to report at all, and typing
 *  the name is always available underneath. */
export async function nearbySchools(lat, lng, { radiusM = 1500, udiseNearby = [] } = {}) {
  let osm = [];
  try {
    const res = await fetch(OVERPASS, { method: 'POST', body: overpassQuery(lat, lng, radiusM) });
    if (res.ok) osm = fromOverpass(await res.json(), lat, lng);
  } catch { /* offline, blocked, or rate limited — fall through */ }
  return mergeCandidates(fromUdise(udiseNearby, lat, lng), osm);
}
