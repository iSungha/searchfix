import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';

const MAX_HTML_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 8_000;

export function isPublicAddress(value: string): boolean {
  try {
    const parsed = ipaddr.parse(value);
    const address = parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()
      ? (parsed as ipaddr.IPv6).toIPv4Address() : parsed;
    return address.range() === 'unicast';
  } catch { return false; }
}

export function validatePublicUrl(value: string): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a public HTTP or HTTPS URL.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a valid absolute URL.'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || !host || url.username || url.password ||
      (url.port && !['80', '443'].includes(url.port)) ||
      !host.includes('.') || /(^|\.)(localhost|local|internal|invalid|test)$/.test(host) ||
      (ipaddr.isValid(host) && !isPublicAddress(host))) {
    throw new Error('Only public HTTP or HTTPS URLs on standard ports are allowed.');
  }
  url.hash = '';
  return url;
}

export function pinnedLookup(address: string, family: number): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

function readOnce(url: URL, address: string, family: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      method: 'GET',
      lookup: pinnedLookup(address, family),
      headers: { accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'identity',
        'user-agent': 'SearchFix/0.1 (local SEO investigator)' },
      timeout: REQUEST_TIMEOUT_MS,
    }, response => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.resume();
        resolve({ status, headers: response.headers, body: '' });
        return;
      }
      if (status < 200 || status >= 300) { response.resume(); reject(new Error(`Website returned HTTP ${status}.`)); return; }
      const type = String(response.headers['content-type'] ?? '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
        response.resume(); reject(new Error('URL did not return HTML.')); return;
      }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.resume(); reject(new Error('Compressed HTML is not supported by this inspection.')); return;
      }
      const declaredLength = Number(response.headers['content-length'] ?? 0);
      if (declaredLength > MAX_HTML_BYTES) { response.destroy(); reject(new Error('HTML exceeds 1 MB limit.')); return; }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_HTML_BYTES) { response.destroy(); reject(new Error('HTML exceeds 1 MB limit.')); }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Website request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

export async function fetchPublicHtml(input: string): Promise<{ url: string; html: string; headers: Record<string, string> }> {
  let url = validatePublicUrl(input);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = ipaddr.isValid(host)
      ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv4' ? 4 : 6 }]
      : await Promise.race([
          lookup(host, { all: true, verbatim: true }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS lookup timed out.')), REQUEST_TIMEOUT_MS)),
        ]);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('URL resolved to a non-public address.');
    const response = await readOnce(url, addresses[0].address, addresses[0].family);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location || redirects === 3) throw new Error('Website redirected too many times.');
      url = validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    return { url: url.toString(), html: response.body,
      headers: { 'x-robots-tag': String(response.headers['x-robots-tag'] ?? '') } };
  }
  throw new Error('Website redirected too many times.');
}
