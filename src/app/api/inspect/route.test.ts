import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('inspection route', () => {
  it('rejects private URLs without fetching', async () => {
    const response = await POST(new Request('http://localhost:3000/api/inspect', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1/' }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/public|allowed/i);
  });
});
