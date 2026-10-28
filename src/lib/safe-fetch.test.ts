import { describe, expect, it } from 'vitest';
import { isPublicAddress, pinnedLookup, validatePublicUrl } from './safe-fetch';

describe('safe URL validation', () => {
  it('rejects non-web protocols, credentials, local names and private addresses', () => {
    for (const value of ['file:///etc/passwd', 'http://localhost/', 'http://site.local/', 'https://user:pass@example.com/', 'http://127.0.0.1/', 'http://[::1]/', 'https://example.com:8443/']) {
      expect(() => validatePublicUrl(value)).toThrow();
    }
    expect(isPublicAddress('10.2.0.5')).toBe(false);
    expect(isPublicAddress('169.254.1.1')).toBe(false);
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('8.8.8.8')).toBe(true);
  });
});

it('pins the validated address when Node requests all lookup results', () => {
  let resolved: unknown;
  pinnedLookup('8.8.8.8', 4)('example.com', { all: true }, (_error, addresses) => { resolved = addresses; });
  expect(resolved).toEqual([{ address: '8.8.8.8', family: 4 }]);
});
