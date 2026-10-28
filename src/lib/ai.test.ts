import { describe, expect, it } from 'vitest';
import { validateAiOutput } from './ai';

describe('AI output guardrails', () => {
  it('rejects unsupported evidence references and malformed output', () => {
    expect(() => validateAiOutput({ hypotheses: [], recommendations: [{ action: 'Change title', rationale: 'Maybe', evidenceIds: ['made-up'] }] }, ['gsc-total'])).toThrow(/evidence/i);
    expect(() => validateAiOutput({ hypotheses: 'definitely algorithm update', recommendations: [] }, ['gsc-total'])).toThrow();
  });

  it('keeps model interpretation labeled as hypothesis', () => {
    const result = validateAiOutput({ hypotheses: [{ text: 'Seasonality may contribute', evidenceIds: ['gsc-total'] }], recommendations: [] }, ['gsc-total']);
    expect(result.hypotheses[0].kind).toBe('hypothesis');
  });
});
