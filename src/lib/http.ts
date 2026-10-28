export async function readTextLimited(message: Request | Response, maxBytes: number): Promise<string> {
  if (Number(message.headers.get('content-length') ?? 0) > maxBytes) throw new Error('Request or response is too large.');
  if (!message.body) throw new Error('Body is empty.');
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('Request or response is too large.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJsonLimited(request: Request, maxBytes: number): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Expected JSON.');
  try { return JSON.parse(await readTextLimited(request, maxBytes)); }
  catch { throw new Error('Invalid or oversized JSON body.'); }
}
