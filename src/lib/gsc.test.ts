import { describe, expect, it } from 'vitest';
import { compareDatasets, parseGscCsv } from './gsc';

describe('GSC CSV parsing', () => {
  it('parses quoted keys and aggregates duplicate rows with impression-weighted position', () => {
    const csv = 'Page,Clicks,Impressions,CTR,Position\n"https://example.com/a,b",2,10,20%,4\n"https://example.com/a,b",3,30,10%,8';
    const data = parseGscCsv(csv, 'page');
    expect(data.rows).toEqual([{ key: 'https://example.com/a,b', clicks: 5, impressions: 40, position: 7 }]);
  });

  it('calculates zero-impression CTR as null and rejects invalid metrics', () => {
    const data = parseGscCsv('Query,Clicks,Impressions,Position\nrare term,0,0,0', 'query');
    expect(data.rows[0].position).toBeNull();
    expect(() => parseGscCsv('Query,Clicks,Impressions,Position\nterm,-1,10,3', 'query')).toThrow(/row 2/i);
    expect(() => parseGscCsv('Page,Clicks,Impressions,Position\nhttps://a.test,1,2,1', 'query')).toThrow(/query/i);
  });

  it('rejects malformed and empty exports', () => {
    expect(() => parseGscCsv('Query,Clicks\nterm,1', 'query')).toThrow(/missing/i);
    expect(() => parseGscCsv('Query,Clicks,Impressions,Position\n', 'query')).toThrow(/no data/i);
  });
});

describe('comparison', () => {
  it('treats absent keys as unobserved, and ranks only the matched cohort', () => {
    const before = parseGscCsv('Query,Clicks,Impressions,Position\nalpha,10,100,3\nbeta,2,20,8', 'query');
    const after = parseGscCsv('Query,Clicks,Impressions,Position\nalpha,4,40,5\ngamma,1,10,9', 'query');
    const result = compareDatasets(before, after);
    expect(result.summary.before.ctr).toBeCloseTo(0.1);
    expect(result.summary.after.ctr).toBeCloseTo(0.1);
    expect(result.summary.matchedPositionBefore).toBe(3);
    expect(result.summary.matchedPositionAfter).toBe(5);
    expect(result.rows.find(row => row.key === 'beta')).toMatchObject({ status: 'onlyBefore', clicksChange: null, impressionsChange: null });
    expect(result.rows.find(row => row.key === 'alpha')?.ctrPointChange).toBe(0);
    expect(result.rows.find(row => row.key === 'beta')?.ctrPointChange).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/unobserved/i);
  });

  it('does not invent a percentage when the baseline is zero', () => {
    const before = parseGscCsv('Query,Clicks,Impressions,Position\nalpha,0,0,0', 'query');
    const after = parseGscCsv('Query,Clicks,Impressions,Position\nalpha,1,10,4', 'query');
    const result = compareDatasets(before, after);
    expect(result.summary.impressionsPercentChange).toBeNull();
    expect(result.summary.before.ctr).toBeNull();
    expect(result.rows[0].positionChange).toBeNull();
    expect(result.rows[0].ctrPointChange).toBeNull();
  });
});
