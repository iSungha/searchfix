import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('comparison route', () => {
  it('accepts CSV files and returns a comparison', async () => {
    const form = new FormData();
    form.set('dimension', 'query');
    form.set('before', new File(['Query,Clicks,Impressions,Position\nalpha,2,10,3'], 'before.csv', { type: 'text/csv' }));
    form.set('after', new File(['Query,Clicks,Impressions,Position\nalpha,1,5,5'], 'after.csv', { type: 'text/csv' }));
    const response = await POST(new Request('http://localhost:3000/api/compare', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.summary.impressionsPercentChange).toBe(-0.5);
  });

  it('rejects a missing file', async () => {
    const response = await POST(new Request('http://localhost:3000/api/compare', { method: 'POST', body: new FormData() }));
    expect(response.status).toBe(400);
  });
});
