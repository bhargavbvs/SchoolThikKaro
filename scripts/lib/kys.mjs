export const KYS_BASE = 'https://kys.udiseplus.gov.in/web-app/api/';
export const YEAR_ID = 11; // 2024-25

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  Referer: 'https://kys.udiseplus.gov.in/',
  Accept: 'application/json',
};

export async function kysGet(path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(KYS_BASE + path, { headers: HEADERS });
      return await res.json();
    } catch (err) {
      if (i === tries - 1) return { status: false, error: { message: String(err) } };
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
}

/** Pulls the four counts out of a region-totals response, or null if the
 *  API returned an error shape. Never throws — a single bad region must not
 *  abort a 46-minute crawl. */
export function parseTotals(json) {
  const d = json?.data;
  if (!json?.status || !d) return null;
  return {
    total: d.totSch,
    girlsCoed: d.totSchGirlsCoed,
    noToilet: d.totSchNotHaveGirlsToilet,
    nonFunctional: d.totSchHaveGirlsToiletButNotFunc,
  };
}

/** Region ids already present in a partially written output file. */
export function alreadyDone(lines) {
  const done = new Set();
  for (const ln of lines) {
    try {
      const id = JSON.parse(ln).regionId;
      if (id !== undefined) done.add(id);
    } catch { /* skip malformed trailing line from an interrupted write */ }
  }
  return done;
}
