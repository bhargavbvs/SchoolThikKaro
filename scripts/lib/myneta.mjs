// Parsing MyNeta (ADR) constituency pages.
//
// One request per constituency returns every candidate with party, criminal
// cases, education, age, assets and liabilities, and marks the winner — so
// the whole affidavit summary for a seat costs a single page, and the
// runners-up come free.
//
// Pure and side-effect free. The crawler stores what these return verbatim,
// so both this project and the constituency app read the same shape.

/** "Rs 9,77,69,833 ~ 9 Crore+" -> 97769833.
 *
 *  Indian digit grouping, so a naive parse of the first number gives 9. The
 *  trailing "~ 9 Crore+" is MyNeta's own rounding and is discarded: we keep
 *  the exact figure and let the display round it. */
export function parseMoney(text) {
  const s = String(text ?? '');
  const m = s.match(/Rs\s*([\d,]+)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** The candidate cell carries the winner marker inline with the name. */
export function parseCandidateCell(text) {
  const raw = String(text ?? '').replace(/&nbsp;?/g, ' ');
  const winner = /\bwinner\b/i.test(raw);
  const name = raw.replace(/\bwinner\b/i, '').replace(/\s+/g, ' ').trim();
  return { name, winner };
}

/** Criminal case count. MyNeta prints a bare integer, and an empty cell
 *  means the affidavit was not analysed — which is not the same as zero. */
export function parseCases(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && /\d/.test(s) ? n : null;
}

const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;?/g, ' ').trim();

/** "List of Candidates in YERRAGONDAPALEM (SC) : PRAKASAM Andhra Pradesh 2024" */
export function parseHeading(title) {
  const t = stripTags(title);
  const m = t.match(/List of Candidates in\s+(.+?)\s*:\s*([^]*?)$/i);
  if (!m) return { constituency: null, district: null };
  const constituency = m[1].trim();
  // The tail is "DISTRICT State Year"; the district is its leading
  // all-caps run, which is how MyNeta writes it.
  const tail = m[2].trim();
  const dm = tail.match(/^([A-Z][A-Z .&'()-]*[A-Z])\b/);
  return { constituency, district: dm ? dm[1].trim() : null };
}

/** Every candidate row on a constituency page. */
export function parseConstituencyPage(html) {
  const title = (String(html).match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '';
  const { constituency, district } = parseHeading(title);

  // Keep each row's raw HTML alongside its text: the candidate id lives in
  // a link that stripTags would discard, and it is what the gap-filling
  // pass needs to reach the detail page.
  const raw = [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const rows = raw.map((r) =>
    [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1])));
  const idOf = (i) => {
    const m = raw[i].match(/candidate_id=(\d+)/);
    return m ? Number(m[1]) : null;
  };

  const header = rows.find((r) => r.length > 3 && /candidate/i.test(r[1] ?? ''));
  const col = (name) => (header ?? []).findIndex((h) => new RegExp(name, 'i').test(h));
  const iCand = col('candidate'), iParty = col('party'), iCases = col('criminal'),
    iEdu = col('education'), iAge = col('age'), iAssets = col('total assets'),
    iLiab = col('liabilit');

  const candidates = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r === header || r.length < 4) continue;
    if (!/^\d+$/.test(r[0] ?? '')) continue;      // data rows are numbered
    const { name, winner } = parseCandidateCell(r[iCand]);
    if (!name) continue;
    candidates.push({
      name, winner, candidateId: idOf(ri),
      party: r[iParty] || null,
      criminalCases: parseCases(r[iCases]),
      education: r[iEdu] || null,
      age: Number(r[iAge]) || null,
      assets: parseMoney(r[iAssets]),
      liabilities: parseMoney(r[iLiab]),
    });
  }
  return { constituency, district, candidates };
}

/** The winner, or null when the page marks none (an unfought or
 *  unpublished seat). Never guesses by assets or position. */
export function winnerOf(page) {
  return page?.candidates?.find((c) => c.winner) ?? null;
}

/** Assets and liabilities from a candidate's own affidavit page.
 *
 *  Needed because the constituency table leaves these blank for a
 *  substantial minority of candidates — 53 of Andhra's 175 winners,
 *  including Ongole's, whose detail page carries the figure the table
 *  omits. Reading the table alone would publish "no assets declared" for
 *  people who declared plenty. */
export function parseCandidateDetail(html) {
  const text = String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;?/g, ' ');
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);

  const after = (re) => {
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) return null;
    // The label and its figure may share a line or sit on the next one.
    for (const cand of [lines[i], lines[i + 1], lines[i + 2]]) {
      const v = parseMoney(cand);
      if (v !== null) return v;
    }
    return null;
  };

  const casesLine = lines.find((l) => /Number of Criminal Cases/i.test(l));
  const casesIdx = casesLine ? lines.indexOf(casesLine) : -1;
  const casesRaw = casesIdx < 0 ? null
    : (casesLine.match(/(\d+)\s*$/) ?? lines[casesIdx + 1]?.match(/^(\d+)$/) ?? [])[1];

  return {
    assets: after(/^Assets:/i),
    liabilities: after(/^Liabilities:/i),
    criminalCases: casesRaw === undefined || casesRaw === null ? null : Number(casesRaw),
  };
}
