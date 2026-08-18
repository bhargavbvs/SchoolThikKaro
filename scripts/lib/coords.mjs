import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { padUdise } from './normalise.mjs';

/** Splits one CSV line into fields, honoring double-quoted fields that may
 *  contain commas (e.g. `"GOVT SCHOOL, QUIBANG"`) and "" as an escaped quote.
 *  A naive line.split(',') silently shifts every column after such a field —
 *  that bug corrupted lat/lng for any school whose name contained a comma. */
export function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

export async function buildCoordIndex(csvPath) {
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });
  const map = new Map();
  let header = null;
  let iCode = -1, iLat = -1, iLng = -1;
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      iCode = header.indexOf('schcd');
      iLat = header.indexOf('lat');
      iLng = header.indexOf('lon');
      continue;
    }
    const f = parseCsvLine(line);
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
