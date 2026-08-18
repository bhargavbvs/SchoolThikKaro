import { describe, it, expect } from 'vitest';
import { padUdise, dedupeDistricts, flattenSchools } from '../scripts/lib/normalise.mjs';

describe('padUdise', () => {
  it('pads a 10-char code to 11', () => {
    expect(padUdise('2813339019')).toBe('02813339019');
  });
  it('leaves an 11-char code untouched', () => {
    expect(padUdise('28133390196')).toBe('28133390196');
  });
  it('trims whitespace before padding', () => {
    expect(padUdise(' 2813339019 ')).toBe('02813339019');
  });
  it('coerces numbers, which is how leading zeros get lost', () => {
    expect(padUdise(2813339019)).toBe('02813339019');
  });
});

describe('dedupeDistricts', () => {
  it('keeps one record per districtId', () => {
    const recs = [
      { _districtId: 1, schools: [{ udiseSchCode: 'a' }] },
      { _districtId: 1, schools: [{ udiseSchCode: 'a' }] },
      { _districtId: 2, schools: [{ udiseSchCode: 'b' }] },
    ];
    expect(dedupeDistricts(recs)).toHaveLength(2);
  });
});

describe('flattenSchools', () => {
  it('flattens districts to schools with padded codes and indicator', () => {
    const recs = [{
      _districtId: 1, _districtName: 'ANAKAPALLI', _stateName: 'ANDHRA PRADESH',
      schools: [{
        udiseSchCode: '28133390196', schoolName: 'ST.PETERS HS ANKP',
        blockName: 'ANAKAPALLI', schCategoryDesc: 'Upper Pr. and Secondary',
        schMgmtNationalDesc: 'Private Unaided (Recognized) ',
        _indicator: 'girls_toilet_nonfunctional',
      }],
    }];
    expect(flattenSchools(recs)[0]).toEqual({
      udise: '28133390196', name: 'ST.PETERS HS ANKP',
      state: 'ANDHRA PRADESH', district: 'ANAKAPALLI', block: 'ANAKAPALLI',
      indicator: 'girls_toilet_nonfunctional',
      category: 'Upper Pr. and Secondary',
      management: 'Private Unaided (Recognized)',
    });
  });
});
