import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const request = (key: string) => new Request('http://localhost:3000/api/analyze', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ apiKey: key, evidence: [{ id: 'gsc-total', text: 'Observed impressions declined from 100 to 50.' }] }),
});

afterEach(() => vi.unstubAllGlobals());

describe('Gemini route', () => {
  it('returns a generic invalid-key error without echoing the key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 403 })));
    const response = await POST(request('private-test-key'));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('private-test-key');
  });

  it('rejects malformed model output instead of displaying it as evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: '{"hypotheses":"proven","recommendations":[]}' }] } }] })));
    const response = await POST(request('private-test-key'));
    expect(response.status).toBe(502);
  });

  it('requests structured JSON from a model available to new projects', async () => {
    const provider = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: '{"hypotheses":[],"recommendations":[]}' }] } }] }));
    vi.stubGlobal('fetch', provider);
    expect((await POST(request('test-placeholder'))).status).toBe(200);
    expect(provider.mock.calls[0][0]).toContain('gemini-3.5-flash-lite');
    const body = JSON.parse(provider.mock.calls[0][1].body);
    expect(body.generationConfig.responseFormat.text.schema.required).toContain('recommendations');
  });
});
