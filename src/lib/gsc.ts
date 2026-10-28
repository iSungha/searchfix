import { parse } from 'csv-parse/sync';

export type Dimension = 'page' | 'query';
export type GscRow = { key: string; clicks: number; impressions: number; position: number | null };
export type GscDataset = { dimension: Dimension; rows: GscRow[]; sourceRows: number };
export type MetricSummary = { clicks: number; impressions: number; ctr: number | null; position: number | null };
export type ComparedRow = {
  id: string; key: string; status: 'matched' | 'onlyBefore' | 'onlyAfter';
  before: GscRow | null; after: GscRow | null;
  clicksChange: number | null; impressionsChange: number | null; ctrPointChange: number | null; positionChange: number | null;
};
export type Evidence = { id: string; text: string; source: 'gsc' | 'technical' };
export type Comparison = {
  dimension: Dimension;
  summary: { before: MetricSummary; after: MetricSummary; clicksPercentChange: number | null;
    impressionsPercentChange: number | null; ctrPointChange: number | null;
    matchedPositionBefore: number | null; matchedPositionAfter: number | null; matchedPositionChange: number | null };
  rows: ComparedRow[]; warnings: string[]; evidence: Evidence[];
};

const integer = (value: string, row: number, name: string): number => {
  const cleaned = value.trim().replace(/,/g, '');
  if (!/^\d+$/.test(cleaned)) throw new Error(`Row ${row}: invalid ${name}.`);
  const number = Number(cleaned);
  if (!Number.isSafeInteger(number)) throw new Error(`Row ${row}: ${name} is too large.`);
  return number;
};

export function parseGscCsv(text: string, dimension: Dimension): GscDataset {
  if (!text || text.length > 2_000_000) throw new Error('CSV must be nonempty and at most 2 MB.');
  let records: Record<string, string>[];
  try {
    records = parse(text, { columns: true, bom: true, skip_empty_lines: true,
      trim: true, relax_quotes: false, max_record_size: 20_000 }) as Record<string, string>[];
  } catch { throw new Error('CSV is malformed. Export a GSC performance table as CSV.'); }
  if (records.length === 0) throw new Error('CSV has no data rows.');
  if (records.length > 10_000) throw new Error('CSV exceeds 10,000 data rows.');
  const headers = Object.keys(records[0]);
  const lookup = (names: string[]) => headers.find(h => names.includes(h.trim().toLowerCase()));
  const keyHeader = lookup(dimension === 'page' ? ['page', 'pages'] : ['query', 'queries']);
  if (!keyHeader) throw new Error(`CSV is missing a ${dimension} column.`);
  const clicksHeader = lookup(['clicks']);
  const impressionsHeader = lookup(['impressions']);
  const positionHeader = lookup(['position', 'average position']);
  if (!clicksHeader || !impressionsHeader || !positionHeader) throw new Error('CSV is missing clicks, impressions, or position.');
  const aggregates = new Map<string, { clicks: number; impressions: number; weightedPosition: number }>();
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    let key = (record[keyHeader] ?? '').trim();
    if (!key) throw new Error(`Row ${rowNumber}: empty ${dimension}.`);
    if (dimension === 'page') {
      try {
        const url = new URL(key);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
        url.hash = '';
        key = url.toString();
      } catch { throw new Error(`Row ${rowNumber}: invalid page URL.`); }
    } else key = key.replace(/\s+/g, ' ').toLowerCase();
    const clicks = integer(record[clicksHeader] ?? '', rowNumber, 'clicks');
    const impressions = integer(record[impressionsHeader] ?? '', rowNumber, 'impressions');
    const rawPosition = (record[positionHeader] ?? '').trim();
    const position = rawPosition === '' ? 0 : Number(rawPosition);
    if (!Number.isFinite(position) || position < 0 || (impressions > 0 && position < 1)) {
      throw new Error(`Row ${rowNumber}: invalid position.`);
    }
    const previous = aggregates.get(key) ?? { clicks: 0, impressions: 0, weightedPosition: 0 };
    aggregates.set(key, { clicks: previous.clicks + clicks,
      impressions: previous.impressions + impressions,
      weightedPosition: previous.weightedPosition + position * impressions });
  });
  const rows = [...aggregates].map(([key, value]) => ({ key, clicks: value.clicks,
    impressions: value.impressions,
    position: value.impressions > 0 ? value.weightedPosition / value.impressions : null }));
  return { dimension, rows, sourceRows: records.length };
}

const summarize = (rows: GscRow[]): MetricSummary => {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const weightedPosition = rows.reduce((sum, row) => sum + (row.position ?? 0) * row.impressions, 0);
  return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? weightedPosition / impressions : null };
};
const percentChange = (before: number, after: number) => before === 0 ? null : (after - before) / before;

export function compareDatasets(before: GscDataset, after: GscDataset): Comparison {
  if (before.dimension !== after.dimension) throw new Error('Both exports must use the same dimension.');
  const beforeMap = new Map(before.rows.map(row => [row.key, row]));
  const afterMap = new Map(after.rows.map(row => [row.key, row]));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const rows: ComparedRow[] = keys.map((key, index) => {
    const first = beforeMap.get(key) ?? null;
    const second = afterMap.get(key) ?? null;
    return { id: `gsc-row-${index + 1}`, key,
      status: first && second ? 'matched' : first ? 'onlyBefore' : 'onlyAfter',
      before: first, after: second,
      clicksChange: first && second ? second.clicks - first.clicks : null,
      impressionsChange: first && second ? second.impressions - first.impressions : null,
      ctrPointChange: first && second && first.impressions > 0 && second.impressions > 0
        ? (second.clicks / second.impressions - first.clicks / first.impressions) * 100 : null,
      positionChange: first?.position != null && second?.position != null ? second.position - first.position : null };
  });
  const beforeSummary = summarize(before.rows);
  const afterSummary = summarize(after.rows);
  const matchedBefore = summarize(rows.flatMap(row => row.status === 'matched' && row.before ? [row.before] : []));
  const matchedAfter = summarize(rows.flatMap(row => row.status === 'matched' && row.after ? [row.after] : []));
  const unobserved = rows.filter(row => row.status !== 'matched').length;
  const warnings = [
    'Export totals describe only rows present in these CSVs. Compare equal-length dates, search type and filters before interpreting changes.',
    ...(unobserved ? [`${unobserved} keys are unobserved in one period; absence is not measured zero traffic.`] : []),
    ...(beforeSummary.impressions < 100 || afterSummary.impressions < 100 ? ['At least one export has fewer than 100 impressions; percentage and position changes are sparse-data signals.'] : []),
  ];
  const evidence: Evidence[] = [
    { id: 'gsc-total', source: 'gsc', text: `Observed export totals: before ${beforeSummary.impressions} impressions and ${beforeSummary.clicks} clicks; after ${afterSummary.impressions} impressions and ${afterSummary.clicks} clicks.` },
    { id: 'gsc-coverage', source: 'gsc', text: `${rows.filter(row => row.status === 'matched').length} matched keys; ${unobserved} keys unobserved in one period.` },
    ...rows.map(row => ({ id: row.id, source: 'gsc' as const,
      text: `${before.dimension} ${row.key}: ${row.before ? `${row.before.impressions} impressions, ${row.before.clicks} clicks before` : 'unobserved before'}; ${row.after ? `${row.after.impressions} impressions, ${row.after.clicks} clicks after` : 'unobserved after'}.${row.positionChange == null ? '' : ` Matched position change ${row.positionChange.toFixed(2)} (positive means worse).`}` })),
  ];
  return { dimension: before.dimension,
    summary: { before: beforeSummary, after: afterSummary,
      clicksPercentChange: percentChange(beforeSummary.clicks, afterSummary.clicks),
      impressionsPercentChange: percentChange(beforeSummary.impressions, afterSummary.impressions),
      ctrPointChange: beforeSummary.ctr == null || afterSummary.ctr == null ? null : (afterSummary.ctr - beforeSummary.ctr) * 100,
      matchedPositionBefore: matchedBefore.position, matchedPositionAfter: matchedAfter.position,
      matchedPositionChange: matchedBefore.position == null || matchedAfter.position == null ? null : matchedAfter.position - matchedBefore.position },
    rows, warnings, evidence };
}
