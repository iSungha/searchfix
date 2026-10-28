import { z } from 'zod';

const hypothesis = z.object({ text: z.string().min(8).max(500), evidenceIds: z.array(z.string()).min(1).max(5) }).strict();
const recommendation = z.object({ action: z.string().min(5).max(300), rationale: z.string().min(5).max(500), evidenceIds: z.array(z.string()).min(1).max(5) }).strict();
const output = z.object({ hypotheses: z.array(hypothesis).max(5), recommendations: z.array(recommendation).max(6) }).strict();

export type AiResult = { hypotheses: { kind: 'hypothesis'; text: string; evidenceIds: string[] }[];
  recommendations: { action: string; rationale: string; evidenceIds: string[] }[] };

export function validateAiOutput(value: unknown, evidenceIds: string[]): AiResult {
  const parsed = output.parse(value);
  const allowed = new Set(evidenceIds);
  for (const item of [...parsed.hypotheses, ...parsed.recommendations]) {
    if (item.evidenceIds.some(id => !allowed.has(id))) throw new Error('AI output references unsupported evidence.');
  }
  return { hypotheses: parsed.hypotheses.map(item => ({ ...item, kind: 'hypothesis' as const })), recommendations: parsed.recommendations };
}
