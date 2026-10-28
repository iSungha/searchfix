import { load } from 'cheerio';
import type { Evidence } from './gsc';

export type TechnicalFinding = { code: string; severity: 'problem' | 'review'; text: string; evidenceIds: string[] };
export type TechnicalResult = {
  url: string; title: string | null; description: string | null; canonical: string | null;
  robots: string | null; headings: { h1: string[]; h2: string[] };
  openGraph: Record<string, string>; jsonLd: { valid: boolean; types: string[] }[];
  findings: TechnicalFinding[]; evidence: Evidence[];
};

function extractTypes(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap(extractTypes))];
  if (!value || typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  const own = item['@type'];
  return [ ...(typeof own === 'string' ? [own] : Array.isArray(own) ? own.filter((v): v is string => typeof v === 'string') : []),
    ...Object.values(item).flatMap(extractTypes) ];
}

export function inspectHtml(url: string, html: string, headers: Record<string, string>): TechnicalResult {
  const $ = load(html);
  const content = (selector: string) => $(selector).first().attr('content')?.trim() || null;
  const title = $('title').first().text().trim() || null;
  const description = content('meta[name="description" i]');
  const canonical = $('link[rel~="canonical" i]').first().attr('href')?.trim() || null;
  const robots = [content('meta[name="robots" i]'), headers['x-robots-tag']?.trim()].filter(Boolean).join('; ') || null;
  const headings = { h1: $('h1').toArray().map(el => $(el).text().trim()).filter(Boolean).slice(0, 20),
    h2: $('h2').toArray().map(el => $(el).text().trim()).filter(Boolean).slice(0, 30) };
  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const name = $(el).attr('property');
    const value = $(el).attr('content');
    if (name && value && Object.keys(openGraph).length < 20) openGraph[name] = value.trim();
  });
  const jsonLd = $('script[type="application/ld+json"]').toArray().slice(0, 20).map(el => {
    try { return { valid: true, types: extractTypes(JSON.parse($(el).html() ?? '')) }; }
    catch { return { valid: false, types: [] }; }
  });
  const evidence: Evidence[] = [
    { id: 'seo-title', source: 'technical', text: `Title: ${title ?? 'absent'}.` },
    { id: 'seo-description', source: 'technical', text: `Meta description: ${description ?? 'absent'}.` },
    { id: 'seo-canonical', source: 'technical', text: `Canonical: ${canonical ?? 'absent'}.` },
    { id: 'seo-robots', source: 'technical', text: `Robots directives: ${robots ?? 'none observed in HTML or X-Robots-Tag header'}.` },
    { id: 'seo-headings', source: 'technical', text: `${headings.h1.length} H1 and ${headings.h2.length} H2 headings observed. H1: ${headings.h1.join('; ') || 'none'}. H2: ${headings.h2.join('; ') || 'none'}.` },
    { id: 'seo-og', source: 'technical', text: `${Object.keys(openGraph).length} Open Graph properties observed: ${Object.entries(openGraph).map(([key, value]) => `${key}=${value}`).join('; ') || 'none'}.` },
    { id: 'seo-jsonld', source: 'technical', text: `${jsonLd.length} JSON-LD blocks observed; ${jsonLd.filter(block => !block.valid).length} invalid JSON blocks. Types: ${jsonLd.flatMap(block => block.types).join(', ') || 'none'}.` },
  ];
  const findings: TechnicalFinding[] = [];
  if (!title) findings.push({ code: 'missing-title', severity: 'problem', text: 'The fetched HTML has no nonempty title element.', evidenceIds: ['seo-title'] });
  if (jsonLd.some(block => !block.valid)) findings.push({ code: 'invalid-jsonld', severity: 'problem', text: 'At least one JSON-LD block is invalid JSON.', evidenceIds: ['seo-jsonld'] });
  if (robots && /(?:^|[,;\s])noindex(?:$|[,;\s])/i.test(robots)) findings.push({ code: 'noindex-observed', severity: 'review', text: 'A noindex directive was observed. Confirm whether excluding this page is intentional.', evidenceIds: ['seo-robots'] });
  return { url, title, description, canonical, robots, headings, openGraph, jsonLd, findings, evidence };
}
