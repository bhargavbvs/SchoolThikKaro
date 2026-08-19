import { describe, it, expect } from 'vitest';
import { parseMoney, parseCandidateCell, parseCases, parseHeading,
  parseConstituencyPage, winnerOf, parseCandidateDetail } from '../scripts/lib/myneta.mjs';

describe('parseMoney', () => {
  it('reads Indian digit grouping, not the first number it sees', () => {
    // "~ 9 Crore+" is MyNeta's own rounding; a naive parse returns 9.
    expect(parseMoney('Rs 9,77,69,833 ~ 9 Crore+')).toBe(97769833);
    expect(parseMoney('Rs 1,14,40,32,575 ~114 Crore+')).toBe(1144032575);
  });
  it('reads a genuine zero', () => {
    expect(parseMoney('Rs 0 ~')).toBe(0);
  });
  it('returns null for an unanalysed candidate, which is not zero', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });
});

describe('parseCandidateCell', () => {
  it('separates the winner marker from the name', () => {
    const c = parseCandidateCell('Chandra Sekhar Tatiparthi&nbsp&nbsp Winner');
    expect(c.name).toBe('Chandra Sekhar Tatiparthi');
    expect(c.winner).toBe(true);
  });
  it('leaves a losing candidate unmarked', () => {
    const c = parseCandidateCell('Ajitha Rao Budala');
    expect(c.winner).toBe(false);
    expect(c.name).toBe('Ajitha Rao Budala');
  });
});

describe('parseCases', () => {
  it('reads the count', () => {
    expect(parseCases('18')).toBe(18);
    expect(parseCases('0')).toBe(0);
  });
  it('distinguishes "not analysed" from zero', () => {
    // An empty cell means no affidavit analysis, which must never be
    // published as "no criminal cases".
    expect(parseCases('')).toBeNull();
    expect(parseCases(null)).toBeNull();
  });
});

describe('parseHeading', () => {
  it('splits constituency from district', () => {
    const h = parseHeading('List of Candidates in YERRAGONDAPALEM (SC) : PRAKASAM Andhra Pradesh 2024');
    expect(h.constituency).toBe('YERRAGONDAPALEM (SC)');
    expect(h.district).toBe('PRAKASAM');
  });
  it('returns nulls for a page that is not a constituency listing', () => {
    expect(parseHeading('404 Not Found').constituency).toBeNull();
  });
});

describe('parseConstituencyPage', () => {
  // The real table shape, with the real row content.
  const html = `<html><head><title>List of Candidates in YERRAGONDAPALEM (SC) : PRAKASAM Andhra Pradesh 2024</title></head><body>
  <table><tr><th>SNo</th><th>Candidate</th><th>Party</th><th>Criminal Cases</th>
  <th>Education</th><th>Age</th><th>Total Assets</th><th>Liabilities</th></tr>
  <tr><td>1</td><td>Ajitha Rao Budala</td><td>INC</td><td>1</td><td>Post Graduate</td><td>50</td><td>Rs 1,75,97,885 ~ 1 Crore+</td><td>Rs 0 ~</td></tr>
  <tr><td>2</td><td>Chandra Sekhar Tatiparthi&nbsp&nbsp Winner</td><td>YSRCP</td><td>3</td><td>Graduate Professional</td><td>44</td><td>Rs 9,77,69,833 ~ 9 Crore+</td><td>Rs 4,07,49,004 ~ 4 Crore+</td></tr>
  <tr><td>3</td><td>Cheduri Venkatesh</td><td>Navarang Congress Party</td><td>0</td><td>Graduate Professional</td><td>40</td><td></td><td></td></tr>
  </table></body></html>`;
  const page = parseConstituencyPage(html);

  it('reads every candidate, not only the winner', () => {
    expect(page.candidates).toHaveLength(3);
  });
  it('identifies the winner from the page, never by guessing', () => {
    const w = winnerOf(page);
    expect(w.name).toBe('Chandra Sekhar Tatiparthi');
    expect(w.party).toBe('YSRCP');
  });
  it('captures the full affidavit summary for each candidate', () => {
    const w = winnerOf(page);
    expect(w.criminalCases).toBe(3);
    expect(w.assets).toBe(97769833);
    expect(w.liabilities).toBe(40749004);
    expect(w.age).toBe(44);
    expect(w.education).toBe('Graduate Professional');
  });
  it('leaves an unanalysed candidate null rather than zero', () => {
    const c = page.candidates.find((x) => x.name === 'Cheduri Venkatesh');
    expect(c.assets).toBeNull();
    expect(c.liabilities).toBeNull();
    expect(c.criminalCases).toBe(0); // this one WAS analysed and is genuinely 0
  });
  it('returns no winner rather than a guess when none is marked', () => {
    const noWinner = parseConstituencyPage(html.replace(/&nbsp&nbsp Winner/, ''));
    expect(winnerOf(noWinner)).toBeNull();
  });
  it('survives a 404 page without throwing', () => {
    const p = parseConstituencyPage('<html><title>404 Not Found</title></html>');
    expect(p.candidates).toEqual([]);
    expect(winnerOf(p)).toBeNull();
  });
});

describe('parseCandidateDetail', () => {
  // The constituency table leaves assets blank for 590 of Andhra's 2,194
  // candidates, including 53 of its 175 winners. Reading the table alone
  // would publish "nothing declared" for people who declared plenty.
  const html = `<html><body>
    <div>Number of Criminal Cases: 18</div>
    <div>Assets &amp; Liabilities</div>
    <div>Assets:</div><div>Rs 1,14,40,32,575</div><div>~114 Crore+</div>
    <div>Liabilities:</div><div>Rs 33,35,65,231</div><div>~33 Crore+</div>
  </body></html>`;

  it('recovers the figures the summary table omits', () => {
    const d = parseCandidateDetail(html);
    expect(d.assets).toBe(1144032575);
    expect(d.liabilities).toBe(333565231);
    expect(d.criminalCases).toBe(18);
  });
  it('returns nulls rather than zeros for a page it cannot read', () => {
    const d = parseCandidateDetail('<html><body>nothing here</body></html>');
    expect(d.assets).toBeNull();
    expect(d.liabilities).toBeNull();
  });
});

describe('candidate ids', () => {
  it('captures the id each row links to, which the gap fill needs', () => {
    const html = `<html><head><title>List of Candidates in ONGOLE : PRAKASAM AP 2024</title></head>
    <table><tr><th>SNo</th><th>Candidate</th><th>Party</th><th>Criminal Cases</th>
    <th>Education</th><th>Age</th><th>Total Assets</th><th>Liabilities</th></tr>
    <tr><td>9</td><td><a href="candidate.php?candidate_id=369">Damacharla Janardhana Rao</a>&nbsp;&nbsp; Winner</td>
    <td>TDP</td><td>18</td><td>Graduate Professional</td><td>49</td><td></td><td></td></tr></table></html>`;
    const p = parseConstituencyPage(html);
    expect(p.candidates[0].candidateId).toBe(369);
    // ...and the row genuinely has no assets, which is why the fill exists.
    expect(p.candidates[0].assets).toBeNull();
  });
});
