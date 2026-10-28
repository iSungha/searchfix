import { z } from 'zod';
import { readJsonLimited } from '../../../lib/http';
import { fetchPublicHtml, validatePublicUrl } from '../../../lib/safe-fetch';
import { inspectHtml } from '../../../lib/seo';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store' };
const input = z.object({ url: z.string().min(1).max(2048) }).strict();

export async function POST(request: Request): Promise<Response> {
  let url: string;
  try {
    url = input.parse(await readJsonLimited(request, 4_000)).url;
    validatePublicUrl(url);
  } catch (error) {
    const message = error instanceof Error && /public|allowed|valid absolute/i.test(error.message)
      ? error.message : 'Enter a valid public website URL.';
    return Response.json({ error: message }, { status: 400, headers: noStore });
  }
  try {
    const fetched = await fetchPublicHtml(url);
    return Response.json(inspectHtml(fetched.url, fetched.html, fetched.headers), { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = /non-public address/.test(message) ? 400 : /timed out/i.test(message) ? 504 : 502;
    return Response.json({ error: status === 400 ? 'URL resolved to a non-public address.' : status === 504 ? 'Website request timed out.' : 'Website could not be inspected as HTML.' },
      { status, headers: noStore });
  }
}
