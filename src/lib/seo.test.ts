import { describe, expect, it } from 'vitest';
import { inspectHtml } from './seo';

describe('technical inspection', () => {
  it('reports observed metadata and a real missing title problem', () => {
    const result = inspectHtml('https://example.com/post', '<html><head><meta name="description" content="A guide"><link rel="canonical" href="https://example.com/post"><script type="application/ld+json">{"@type":"Article"}</script></head><body><h1>Guide</h1></body></html>', {});
    expect(result.title).toBeNull();
    expect(result.description).toBe('A guide');
    expect(result.headings.h1).toEqual(['Guide']);
    expect(result.jsonLd).toEqual([{ valid: true, types: ['Article'] }]);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'missing-title', severity: 'problem' }));
  });

  it('does not call an intentional-looking noindex or absent OG tag a proven defect', () => {
    const result = inspectHtml('https://example.com/', '<head><title>Home</title><meta name="robots" content="noindex"></head>', {});
    expect(result.robots).toContain('noindex');
    expect(result.findings.some(f => f.severity === 'problem')).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'noindex-observed', severity: 'review' }));
  });

  it('flags invalid JSON-LD as observed evidence', () => {
    const result = inspectHtml('https://example.com/', '<title>Home</title><script type="application/ld+json">{invalid}</script>', {});
    expect(result.jsonLd[0].valid).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'invalid-jsonld', severity: 'problem' }));
  });
});
