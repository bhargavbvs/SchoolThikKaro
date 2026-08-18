export function padUdise(code) {
  return String(code).trim().padStart(11, '0');
}

export function dedupeDistricts(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    if (seen.has(r._districtId)) continue;
    seen.add(r._districtId);
    out.push(r);
  }
  return out;
}

export function flattenSchools(records) {
  const out = [];
  for (const r of dedupeDistricts(records)) {
    for (const s of r.schools) {
      out.push({
        udise: padUdise(s.udiseSchCode),
        name: String(s.schoolName ?? '').trim(),
        state: r._stateName,
        district: r._districtName,
        block: s.blockName ?? null,
        indicator: s._indicator,
        category: (s.schCategoryDesc ?? '').trim() || null,
        management: (s.schMgmtNationalDesc ?? '').trim() || null,
      });
    }
  }
  return out;
}
