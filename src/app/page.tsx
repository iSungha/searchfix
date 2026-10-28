'use client';

import { useMemo, useState } from 'react';
import type { AiResult } from '../lib/ai';
import type { Comparison, Dimension, Evidence } from '../lib/gsc';
import { buildRecommendations, renderMarkdown } from '../lib/report';
import type { TechnicalResult } from '../lib/seo';

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Request failed.');
  return data;
}

const percent = (value: number | null) => value == null ? 'N/A' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
const decimal = (value: number | null, digits = 2) => value == null ? 'N/A' : value.toFixed(digits);

export default function Home() {
  const [dimension, setDimension] = useState<Dimension>('page');
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [technical, setTechnical] = useState<TechnicalResult | null>(null);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'compare' | 'inspect' | 'analyze' | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const recommendations = useMemo(() => buildRecommendations(comparison, technical), [comparison, technical]);
  const evidence = useMemo(() => [...(comparison?.evidence ?? []), ...(technical?.evidence ?? [])], [comparison, technical]);

  async function compare(first: File, second: File, mode: Dimension, label: string) {
    setBusy('compare'); setError('');
    try {
      const form = new FormData();
      form.set('dimension', mode); form.set('before', first); form.set('after', second);
      const result = await responseJson<Comparison>(await fetch('/api/compare', { method: 'POST', body: form, cache: 'no-store' }));
      setDimension(mode); setComparison(result); setTechnical(null); setAi(null); setSiteUrl(''); setSource(label);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Comparison failed.'); }
    finally { setBusy(null); }
  }

  async function loadDemo() {
    setBusy('compare'); setError('');
    try {
      const [before, after] = await Promise.all([
        fetch('/sample/before.csv').then(response => response.text()),
        fetch('/sample/after.csv').then(response => response.text()),
      ]);
      await compare(new File([before], 'before.csv', { type: 'text/csv' }),
        new File([after], 'after.csv', { type: 'text/csv' }), 'page', 'Synthetic blog decline demo');
    } catch { setError('Could not load the sample CSV files.'); setBusy(null); }
  }

  async function inspect() {
    setBusy('inspect'); setError('');
    try {
      const result = await responseJson<TechnicalResult>(await fetch('/api/inspect', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: siteUrl }), cache: 'no-store',
      }));
      setTechnical(result); setAi(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Inspection failed.'); }
    finally { setBusy(null); }
  }

  async function analyze() {
    if (!apiKey.trim() || evidence.length === 0) return;
    setBusy('analyze'); setError('');
    const selected: Evidence[] = [
      ...evidence.filter(item => item.id === 'gsc-total' || item.id === 'gsc-coverage'),
      ...comparison?.rows.filter(row => row.status === 'matched' && row.impressionsChange != null)
        .sort((a, b) => (a.impressionsChange ?? 0) - (b.impressionsChange ?? 0))
        .slice(0, 25).flatMap(row => evidence.filter(item => item.id === row.id)) ?? [],
      ...technical?.evidence ?? [],
    ];
    try {
      const result = await responseJson<AiResult>(await fetch('/api/analyze', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey, evidence: selected.slice(0, 60).map(item => ({ id: item.id, text: item.text.slice(0, 500) })) }),
        cache: 'no-store',
      }));
      setAi(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'AI analysis failed.'); }
    finally { setApiKey(''); setBusy(null); }
  }

  function downloadReport() {
    const markdown = renderMarkdown(comparison, technical, ai, recommendations);
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'searchfix-report.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const rankedRows = comparison?.rows.slice().sort((a, b) => {
    if (a.status !== 'matched') return 1;
    if (b.status !== 'matched') return -1;
    return (a.impressionsChange ?? 0) - (b.impressionsChange ?? 0);
  }).slice(0, 20) ?? [];

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">↗</span><span>SearchFix</span></div><span className="top-note">LOCAL SEO INVESTIGATOR · PORTFOLIO MVP</span></header>
    <section className="hero"><div className="eyebrow">EVIDENCE FIRST SEO</div><h1>Find the signal.<br /><em>Question the cause.</em></h1>
      <p>Compare Search Console exports, inspect a public page, and use optional AI to frame next steps. Every conclusion stays tied to observed evidence.</p>
      <button className="button primary" onClick={loadDemo} disabled={busy !== null}>{busy === 'compare' ? 'Loading…' : 'Load offline demo'} <span>→</span></button>
    </section>
    <section className="workflow" aria-label="Investigation inputs">
      <div className="panel"><div className="step">01 / PERFORMANCE</div><h2>Compare GSC exports</h2><p>Use matching date lengths, search type, and filters. Upload the Pages or Queries table CSV from each period.</p>
        <label>Comparison level<select value={dimension} onChange={event => setDimension(event.target.value as Dimension)}><option value="page">Pages</option><option value="query">Queries</option></select></label>
        <div className="file-grid"><label>Before CSV<input type="file" accept=".csv,text/csv" onChange={event => setBeforeFile(event.target.files?.[0] ?? null)} /></label>
          <label>After CSV<input type="file" accept=".csv,text/csv" onChange={event => setAfterFile(event.target.files?.[0] ?? null)} /></label></div>
        <button className="button dark" disabled={!beforeFile || !afterFile || busy !== null} onClick={() => beforeFile && afterFile && compare(beforeFile, afterFile, dimension, `${beforeFile.name} vs ${afterFile.name}`)}>Compare exports</button>
      </div>
      <div className="panel"><div className="step">02 / TECHNICAL</div><h2>Inspect public HTML</h2><p>Fetch one URL and record the tags actually returned. A snapshot cannot establish indexing or the cause of a traffic change.</p>
        <label>Public URL<input type="url" placeholder="https://example.org/blog/post" value={siteUrl} onChange={event => setSiteUrl(event.target.value)} /></label>
        <button className="button dark" disabled={!siteUrl.trim() || busy !== null} onClick={inspect}>{busy === 'inspect' ? 'Inspecting…' : 'Inspect URL'}</button>
      </div>
      <div className="panel"><div className="step">03 / INTERPRETATION</div><h2>Optional Gemini analysis</h2><p>Your key stays in this tab only and is cleared after analysis. AI output is labeled as hypotheses and checked against evidence IDs.</p>
        <label>Gemini API key<input type="password" name="searchfix-temporary-gemini-key" autoComplete="new-password" spellCheck={false} placeholder="Enter key for one analysis" value={apiKey} onChange={event => setApiKey(event.target.value)} /></label>
        <button className="button dark" disabled={!apiKey.trim() || evidence.length === 0 || busy !== null} onClick={analyze}>{busy === 'analyze' ? 'Analyzing…' : 'Analyze evidence'}</button>
      </div>
    </section>
    {error && <div role="alert" className="alert">{error}</div>}
    {(comparison || technical) && <section className="results" aria-label="Investigation results">
      <div className="section-heading"><div><div className="eyebrow">INVESTIGATION RESULTS</div><h2>{source || 'Public page inspection'}</h2></div><button className="button outline" onClick={downloadReport}>Download Markdown ↓</button></div>
      {comparison && <><div className="metrics">
        <div className="metric"><span>Impressions</span><strong>{comparison.summary.after.impressions.toLocaleString()}</strong><small>{percent(comparison.summary.impressionsPercentChange)} vs before · {comparison.summary.before.impressions.toLocaleString()} before</small></div>
        <div className="metric"><span>Clicks</span><strong>{comparison.summary.after.clicks.toLocaleString()}</strong><small>{percent(comparison.summary.clicksPercentChange)} vs before · {comparison.summary.before.clicks.toLocaleString()} before</small></div>
        <div className="metric"><span>CTR</span><strong>{comparison.summary.after.ctr == null ? 'N/A' : `${(comparison.summary.after.ctr * 100).toFixed(2)}%`}</strong><small>{comparison.summary.ctrPointChange == null ? 'N/A' : `${comparison.summary.ctrPointChange >= 0 ? '+' : ''}${decimal(comparison.summary.ctrPointChange)} points`} vs before</small></div>
        <div className="metric"><span>Matched position</span><strong>{decimal(comparison.summary.matchedPositionAfter)}</strong><small>{comparison.summary.matchedPositionChange == null ? 'N/A' : `${comparison.summary.matchedPositionChange >= 0 ? '+' : ''}${decimal(comparison.summary.matchedPositionChange)} positions`} · positive is worse</small></div>
      </div><div className="notice"><strong>Read the comparison carefully.</strong> {comparison.warnings.join(' ')}</div>
      <div className="result-card"><div className="card-heading"><h3>Largest observed changes</h3><span>Top 20 rows · {comparison.dimension} level</span></div>
        <div className="table-wrap"><table><thead><tr><th>{comparison.dimension === 'page' ? 'Page' : 'Query'}</th><th>Before impr.</th><th>After impr.</th><th>Impr. change</th><th>Clicks change</th><th>CTR change</th><th>Position change</th><th>Evidence</th></tr></thead>
          <tbody>{rankedRows.map(row => <tr key={row.id}><td className="key-cell">{row.key}</td><td>{row.before?.impressions.toLocaleString() ?? 'Unobserved'}</td><td>{row.after?.impressions.toLocaleString() ?? 'Unobserved'}</td>
            <td>{row.impressionsChange == null ? 'N/A' : `${row.impressionsChange >= 0 ? '+' : ''}${row.impressionsChange.toLocaleString()}`}</td>
            <td>{row.clicksChange == null ? 'N/A' : `${row.clicksChange >= 0 ? '+' : ''}${row.clicksChange.toLocaleString()}`}</td>
            <td>{row.ctrPointChange == null ? 'N/A' : `${row.ctrPointChange >= 0 ? '+' : ''}${decimal(row.ctrPointChange)} pp`}</td>
            <td>{row.positionChange == null ? 'N/A' : `${row.positionChange >= 0 ? '+' : ''}${decimal(row.positionChange)}`}</td><td><code>{row.id}</code></td></tr>)}</tbody></table></div></div></>}
      {technical && <div className="result-card"><div className="card-heading"><h3>Technical HTML snapshot</h3><span>{technical.url}</span></div>
        <div className="technical-grid"><div><b>Title</b><span>{technical.title ?? 'Absent'}</span></div><div><b>Description</b><span>{technical.description ?? 'Absent'}</span></div>
          <div><b>Canonical</b><span>{technical.canonical ?? 'Absent'}</span></div><div><b>Robots</b><span>{technical.robots ?? 'None observed'}</span></div>
          <div><b>Headings</b><span>{technical.headings.h1.length} H1 · {technical.headings.h2.length} H2</span></div><div><b>Structured / social</b><span>{technical.jsonLd.length} JSON-LD · {Object.keys(technical.openGraph).length} OG tags</span></div></div>
        <details className="technical-details"><summary>View heading, Open Graph and JSON-LD evidence</summary>
          <p><b>H1:</b> {technical.headings.h1.join('; ') || 'None observed'}</p><p><b>H2:</b> {technical.headings.h2.join('; ') || 'None observed'}</p>
          <p><b>Open Graph:</b> {Object.entries(technical.openGraph).map(([key, value]) => `${key}: ${value}`).join('; ') || 'None observed'}</p>
          <p><b>JSON-LD:</b> {technical.jsonLd.map((block, index) => `Block ${index + 1}: ${block.valid ? 'valid JSON' : 'invalid JSON'}; types ${block.types.join(', ') || 'none observed'}`).join('; ') || 'None observed'}</p>
        </details>
        {technical.findings.length ? <ul className="finding-list">{technical.findings.map(finding => <li key={finding.code}><strong>{finding.severity.toUpperCase()}</strong> {finding.text} <code>{finding.evidenceIds.join(', ')}</code></li>)}</ul> : <p className="quiet">No concrete problems detected in this limited HTML snapshot.</p>}</div>}
      <div className="two-columns"><div className="result-card"><div className="card-heading"><h3>Prioritized next steps</h3><span>Deterministic · evidence linked</span></div>
        {recommendations.length ? <ol className="recommendations">{recommendations.map((item, index) => <li key={`${item.action}-${index}`}><span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span><div><b>{item.action}</b><p>{item.rationale}</p><small>Evidence: {item.evidenceIds.join(', ')}</small></div></li>)}</ol> : <p className="quiet">Load an export or inspect a URL to see recommendations.</p>}</div>
      <div className="result-card"><div className="card-heading"><h3>What remains unknown</h3><span>Cause is not inferred</span></div><p>These exports and one HTML response cannot prove why search visibility changed. Check comparable periods, indexing, crawl signals, site changes, and external context before making a causal claim.</p>
        {ai && <><h4>AI hypotheses · unverified</h4><ul className="finding-list">{ai.hypotheses.map((item, index) => <li key={index}>{item.text} <code>{item.evidenceIds.join(', ')}</code></li>)}</ul>
          <h4>Additional AI next steps</h4><ul className="finding-list">{ai.recommendations.map((item, index) => <li key={index}><b>{item.action}</b> — {item.rationale} <code>{item.evidenceIds.join(', ')}</code></li>)}</ul></>}</div></div>
      <details className="evidence"><summary>Evidence ledger · {evidence.length} observations</summary><ul>{evidence.slice(0, 100).map(item => <li key={item.id}><code>{item.id}</code><span>{item.text}</span></li>)}</ul></details>
    </section>}
    <footer>SearchFix · Local-only portfolio project · Exported GSC rows are observations, not complete site totals.</footer>
  </main>;
}
