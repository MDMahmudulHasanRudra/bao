import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localdomain') ||
    h === 'metadata.google.internal' ||
    h === 'metadata' ||
    h.endsWith('.oraclecloud.internal')
  ) {
    return true;
  }
  const v = isIP(h);
  if (v === 4) return isPrivateIpv4(h);
  if (v === 6) {
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
  }
  return false;
}

/** Blocks SSRF: non-http schemes, embedded credentials, private/loopback/link-local IPs,
 *  internal hostnames, and hostnames that resolve to any of those. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL scheme must be http or https');
  }
  if (url.username || url.password) {
    throw new Error('URL must not contain credentials');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error('URL host is not allowed');
  }
  if (!isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
    try {
      const records = await lookup(url.hostname, { all: true });
      if (records.length === 0 || records.some((r) => isBlockedHostname(r.address))) {
        throw new Error('URL host is not allowed');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'URL host is not allowed') throw err;
      throw new Error('URL host could not be resolved');
    }
  }
  return url;
}
