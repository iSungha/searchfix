import { compareDatasets, parseGscCsv, type Dimension } from '../../../lib/gsc';

export const runtime = 'nodejs';
const MAX_BODY = 4_200_000;
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: Request): Promise<Response> {
  if (!(request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    return Response.json({ error: 'Upload two CSV files.' }, { status: 400, headers: noStore });
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) {
    return Response.json({ error: 'Upload is too large.' }, { status: 413, headers: noStore });
  }
  try {
    if (!request.body) throw new Error('Upload body is empty.');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error('Upload is too large.'); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const bounded = new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type') ?? '' }, body });
    const form = await bounded.formData();
    const before = form.get('before');
    const after = form.get('after');
    const dimension = form.get('dimension');
    if ((dimension !== 'page' && dimension !== 'query') || !(before instanceof File) || !(after instanceof File)) {
      throw new Error('Choose a dimension and upload both CSV files.');
    }
    if (before.size > 2_000_000 || after.size > 2_000_000) throw new Error('Each CSV must be at most 2 MB.');
    const result = compareDatasets(parseGscCsv(await before.text(), dimension as Dimension),
      parseGscCsv(await after.text(), dimension as Dimension));
    return Response.json(result, { headers: noStore });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid CSV upload.' }, { status: 400, headers: noStore });
  }
}
