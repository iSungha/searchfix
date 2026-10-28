import type { AiResult } from './ai';
import type { Comparison, Evidence } from './gsc';
import type { TechnicalResult } from './seo';

export type Recommendation = { priority: 'High' | 'Medium' | 'Low'; action: string; rationale: string; evidenceIds: string[] };
const number = (value: number | null, digits = 1) => value == null ? 'N/A' : value.toFixed(digits);
const safe = (value: string) => value.replace(/[\r\n|`]/g, ' ').trim();

export function buildRecommendations(comparison: Comparison | null, technical: TechnicalResult | null): Recommendation[] {
  const items: Recommendation[] = [];
  if (comparison) {
    const losses = comparison.rows.filter(row => row.status === 'matched' && row.before && row.after &&
      row.before.impressions >= 100 && row.after.impressions <= row.before.impressions * 0.8)
      .sort((a, b) => (a.impressionsChange ?? 0) - (b.impressionsChange ?? 0));
    if (losses[0]) items.push({ priority: 'High',
      action: `Investigate ${losses[0].key} in Search Console`,
      rationale: 'This matched row has the largest observed impression decline. Check date patterns, indexing and query mix before assigning a cause.',
      evidenceIds: [losses[0].id] });
    items.push({ priority: 'Medium', action: 'Confirm both exports use comparable date ranges and filters',
      rationale: 'CSV exports do not carry enough context to verify period length, search type or filters.', evidenceIds: ['gsc-total', 'gsc-coverage'] });
  }
  if (technical) for (const finding of technical.findings) {
    items.push({ priority: finding.severity === 'problem' ? 'High' : 'Medium',
      action: finding.code === 'missing-title' ? 'Add a descriptive HTML title' : finding.code === 'invalid-jsonld' ? 'Correct the invalid JSON-LD' : 'Confirm whether noindex is intentional',
      rationale: finding.text, evidenceIds: finding.evidenceIds });
  }
  return items;
}

export function renderMarkdown(comparison: Comparison | null, technical: TechnicalResult | null, ai: AiResult | null,
  recommendations: Recommendation[]): string {
  const evidence: Evidence[] = [...(comparison?.evidence ?? []), ...(technical?.evidence ?? [])];
  const lines = ['# SearchFix investigation', '', '## Verified observations', ''];
  if (comparison) {
    const s = comparison.summary;
    lines.push(`Dimension: ${comparison.dimension}. Exported rows are observations, not complete site traffic.`, '',
      '| Metric | Before | After | Change |', '| --- | ---: | ---: | ---: |',
      `| Impressions | ${s.before.impressions} | ${s.after.impressions} | ${s.impressionsPercentChange == null ? 'N/A' : `${number(s.impressionsPercentChange * 100)}%`} |`,
      `| Clicks | ${s.before.clicks} | ${s.after.clicks} | ${s.clicksPercentChange == null ? 'N/A' : `${number(s.clicksPercentChange * 100)}%`} |`,
      `| CTR | ${s.before.ctr == null ? 'N/A' : `${number(s.before.ctr * 100, 2)}%`} | ${s.after.ctr == null ? 'N/A' : `${number(s.after.ctr * 100, 2)}%`} | ${s.ctrPointChange == null ? 'N/A' : `${number(s.ctrPointChange, 2)} points`} |`,
      `| Matched-key position | ${number(s.matchedPositionBefore, 2)} | ${number(s.matchedPositionAfter, 2)} | ${number(s.matchedPositionChange, 2)} (positive = worse) |`, '',
      '### Comparison caveats', '', ...comparison.warnings.map(w => `- ${safe(w)}`), '',
      '### Rows', '', '| Key | Before impressions | After impressions | Clicks change | CTR change | Position change | Status |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
      ...comparison.rows.slice(0, 50).map(row => `| ${safe(row.key)} | ${row.before?.impressions ?? 'Unobserved'} | ${row.after?.impressions ?? 'Unobserved'} | ${row.clicksChange ?? 'N/A'} | ${row.ctrPointChange == null ? 'N/A' : `${number(row.ctrPointChange, 2)} points`} | ${row.positionChange == null ? 'N/A' : number(row.positionChange, 2)} | ${row.status} |`), '');
  }
  if (technical) lines.push('### Technical inspection', '', `URL: ${safe(technical.url)}`, '',
    `Title: ${safe(technical.title ?? 'absent')}`, '', `Description: ${safe(technical.description ?? 'absent')}`, '',
    `Canonical: ${safe(technical.canonical ?? 'absent')}`, '', `Robots: ${safe(technical.robots ?? 'none observed')}`, '',
    `H1: ${technical.headings.h1.map(safe).join('; ') || 'none observed'}`, '',
    `H2: ${technical.headings.h2.map(safe).join('; ') || 'none observed'}`, '',
    'Open Graph:', '', ...Object.entries(technical.openGraph).map(([key, value]) => `- ${safe(key)}: ${safe(value)}`), '',
    'JSON-LD:', '', ...technical.jsonLd.map((block, index) => `- Block ${index + 1}: ${block.valid ? 'valid JSON' : 'invalid JSON'}; types: ${block.types.map(safe).join(', ') || 'none observed'}`), '',
    ...technical.findings.map(f => `- **${f.severity}:** ${safe(f.text)} [${f.evidenceIds.join(', ')}]`), '');
  lines.push('## Prioritized recommendations', '', ...recommendations.map(item =>
    `- **${item.priority}: ${safe(item.action)}** — ${safe(item.rationale)} [${item.evidenceIds.join(', ')}]`), '');
  if (ai) lines.push('## Plausible hypotheses (AI; unverified)', '',
    ...ai.hypotheses.map(item => `- ${safe(item.text)} [${item.evidenceIds.join(', ')}]`), '',
    '## Additional AI recommendations', '',
    ...ai.recommendations.map(item => `- **${safe(item.action)}** — ${safe(item.rationale)} [${item.evidenceIds.join(', ')}]`), '');
  lines.push('## Unknown causes', '',
    'The root cause remains unknown from these exports and one fetched HTML response alone. Verify date comparability, indexing, crawl data, site changes and external context before drawing causal conclusions.', '',
    '## Evidence references', '', ...evidence.slice(0, 100).map(item => `- **${item.id}** (${item.source}): ${safe(item.text)}`), '');
  return lines.join('\n');
}
