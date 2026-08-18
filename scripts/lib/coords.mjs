import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { padUdise } from './normalise.mjs';

export async function buildCoordIndex(csvPath) {
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });
  const map = new Map();
  let header = null;
  let iCode = -1, iLat = -1, iLng = -1;
  for await (const line of rl) {
    if (!header) {
      header = line.split(',');
      iCode = header.indexOf('schcd');
      iLat = header.indexOf('lat');
      iLng = header.indexOf('lon');
      continue;
    }
    const f = line.split(',');
    const lat = Number(f[iLat]), lng = Number(f[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    map.set(padUdise(f[iCode]), { lat, lng });
  }
  return map;
}

export function joinSchools(schools, coordIndex) {
  const matched = [], unmatched = [];
  for (const s of schools) {
    const c = coordIndex.get(padUdise(s.udise));
    if (c) matched.push({ ...s, lat: c.lat, lng: c.lng });
    else unmatched.push(s);
  }
  const total = schools.length;
  return { matched, unmatched, matchRate: total ? matched.length / total : 0 };
}
