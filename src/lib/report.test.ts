import { describe, expect, it } from 'vitest';
import { compareDatasets, parseGscCsv } from './gsc';
import { buildRecommendations, renderMarkdown } from './report';
import { inspectHtml } from './seo';

const before = parseGscCsv('Page,Clicks,Impressions,Position\nhttps://example.org/blog/a,50,1000,4\nhttps://example.org/blog/b,3,30,9', 'page');
const after = parseGscCsv('Page,Clicks,Impressions,Position\nhttps://example.org/blog/a,20,400,7', 'page');

describe('evidence-backed reporting', () => {
  it('does not describe an unobserved row as a measured decline', () => {
    const comparison = compareDatasets(before, after);
    const recommendations = buildRecommendations(comparison, null);
    expect(recommendations.every(item => item.evidenceIds.length > 0)).toBe(true);
    expect(recommendations.some(item => item.action.includes('/blog/b'))).toBe(false);
    expect(recommendations.some(item => item.action.includes('/blog/a'))).toBe(true);
  });

  it('exports a report with evidence and the unknown-cause boundary', () => {
    const comparison = compareDatasets(before, after);
    const markdown = renderMarkdown(comparison, null, null, buildRecommendations(comparison, null));
    expect(markdown).toContain('gsc-total');
    expect(markdown).toMatch(/root cause.*unknown/i);
    expect(markdown).toContain('Unobserved');
  });

  it('exports inspected headings, Open Graph values and JSON-LD types', () => {
    const technical = inspectHtml('https://example.org/', '<head><title>Example</title><meta property="og:title" content="Social title"><script type="application/ld+json">{"@type":"Article"}</script></head><body><h1>Article heading</h1></body>', {});
    const markdown = renderMarkdown(null, technical, null, buildRecommendations(null, technical));
    expect(markdown).toContain('Article heading');
    expect(markdown).toContain('Social title');
    expect(markdown).toContain('Article');
  });
});
