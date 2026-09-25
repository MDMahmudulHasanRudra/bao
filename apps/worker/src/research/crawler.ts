import type { CrawlOptions, CrawlerProvider, WebDocumentData } from '@bao/contracts';
import { loadEnv } from '@bao/config';
import { getLogger } from '../logger.js';
import { assertSafeUrl } from '../net/safe-url.js';
import { extractDocument, normalizeUrl, PRIORITY_PATHS } from './extract.js';

const env = loadEnv();
const log = getLogger('worker-crawler');

const MAX_REDIRECTS = 5;

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  depth: env.CRAWLER_MAX_DEPTH,
  maxPages: env.RESEARCH_MAX_PAGES_PER_COMPANY,
  maxPagesPerDomain: env.CRAWLER_MAX_PAGES_PER_DOMAIN,
  timeoutMs: env.CRAWLER_REQUEST_TIMEOUT,
  maxResponseBytes: env.CRAWLER_MAX_RESPONSE_SIZE,
  respectRobots: env.CRAWLER_RESPECT_ROBOTS,
  userAgent: env.CRAWLER_USER_AGENT,
};

/** Per-host serialization + minimum gap between requests to the same host. */
const hostQueues = new Map<string, Promise<unknown>>();

async function rateLimit(host: string, gapMs: number): Promise<void> {
  const previous = hostQueues.get(host) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((r) => (release = r));
  hostQueues.set(host, previous.then(() => current));
  await previous;
  await new Promise((r) => setTimeout(r, gapMs));
  release();
}

const robotsCache = new Map<string, { disallow: string[]; fetchedAt: number }>();
const ROBOTS_TTL_MS = env.RESEARCH_CACHE_TTL_SECONDS * 1000;

async function loadRobots(origin: string, userAgent: string): Promise<string[]> {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) return cached.disallow;

  const disallow: string[] = [];
  try {
    let current = new URL('/robots.txt', origin);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const res = await fetch(current.toString(), {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(10_000),
        // A public origin can redirect robots.txt into the private network, so walk
        // the chain by hand and re-assert the SSRF guard on every hop.
        redirect: 'manual',
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error('Redirect without location');
        if (redirect === MAX_REDIRECTS) throw new Error('Too many redirects');
        current = await assertSafeUrl(new URL(location, current).toString());
        continue;
      }
      if (!res.ok) break;

      // Only Disallow rules for our agent (or *) apply; Allow is handled by longest-match below.
      let applies = false;
      for (const rawLine of (await res.text()).split(/\r?\n/)) {
        const line = rawLine.split('#')[0].trim();
        const [rawKey, ...rest] = line.split(':');
        if (!rawKey) continue;
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key === 'user-agent') applies = value === '*' || userAgent.startsWith(value);
        if (applies && key === 'disallow' && value) disallow.push(value);
        if (applies && key === 'allow' && value) disallow.push(`!${value}`);
      }
      break;
    }
  } catch (err) {
    // No robots.txt (or unreachable) means no stated restriction.
    log.debug({ err, origin }, 'robots.txt unavailable');
  }

  robotsCache.set(origin, { disallow, fetchedAt: Date.now() });
  return disallow;
}

function isAllowedByRobots(rules: string[], pathname: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const rule of rules) {
    const allow = rule.startsWith('!');
    const pattern = allow ? rule.slice(1) : rule;
    if (pattern && pathname.startsWith(pattern)) {
      if (!best || pattern.length > best.len) best = { len: pattern.length, allow };
    }
  }
  return best ? best.allow : true;
}

function rankLink(href: string): number {
  try {
    const path = new URL(href).pathname.toLowerCase();
    const index = PRIORITY_PATHS.findIndex((p) => path.includes(p));
    return index === -1 ? PRIORITY_PATHS.length : index;
  } catch {
    return PRIORITY_PATHS.length;
  }
}

async function fetchHtml(url: URL, options: CrawlOptions): Promise<string> {
  let current = url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const res = await fetch(current.toString(), {
      method: 'GET',
      headers: { 'User-Agent': options.userAgent, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(options.timeoutMs),
      redirect: 'manual',
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect without location');
      if (redirect === MAX_REDIRECTS) throw new Error('Too many redirects');
      // a public URL can redirect into the private network
      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }

    if (res.status === 403 || res.status === 401) throw new Error(`BLOCKED:${res.status}`);
    if (res.status === 429) throw new Error('RATE_LIMITED');
    if (!res.ok) throw new Error(`FETCH_ERROR:${res.status}`);

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('html') && !contentType.startsWith('text/')) {
      throw new Error(`INVALID_CONTENT:${contentType}`);
    }

    const declared = Number(res.headers.get('content-length') || '0');
    if (declared > options.maxResponseBytes) throw new Error('Response too large');

    // stream-limit so an undeclared/chunked body cannot exhaust memory
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxResponseBytes) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map(Buffer.from)).toString('utf-8');
  }
  throw new Error('Too many redirects');
}

/**
 * Section 13: plain HTTP first, no browser. Returns a failed document rather than
 * throwing, so one inaccessible site never fails the whole job (section 16).
 */
export const internalCrawler: CrawlerProvider = {
  id: 'internal',

  async fetch(url: string, overrides: Partial<CrawlOptions> = {}): Promise<WebDocumentData> {
    const options = { ...DEFAULT_CRAWL_OPTIONS, ...overrides };
    const safe = await assertSafeUrl(url);
    const origin = safe.origin;
    await rateLimit(origin, options.respectRobots ? env.CRAWLER_RATE_LIMIT_MS : 0);

    const base: WebDocumentData = {
      url: safe.toString(),
      headings: [],
      content: '',
      links: [],
      emails: [],
      phones: [],
      socialLinks: [],
      contentHash: '',
      sourceType: 'website',
      status: 'failed',
      retrievedAt: new Date().toISOString(),
      provider: 'internal',
    };

    try {
      if (options.respectRobots) {
        const rules = await loadRobots(origin, options.userAgent);
        if (!isAllowedByRobots(rules, safe.pathname)) {
          return { ...base, status: 'blocked', error: 'Blocked by robots.txt' };
        }
      }

      const html = await fetchHtml(safe, options);
      const doc = extractDocument(html, safe.toString());
      if (!doc.content) return { ...base, status: 'failed', error: 'No extractable content' };

      return {
        ...base,
        ...doc,
        canonicalUrl: doc.canonicalUrl ?? normalizeUrl(safe.toString()),
        status: 'success',
      };
    } catch (err) {
      const error = (err as Error).message;
      log.warn({ url: safe.toString(), error }, 'crawl failed');
      return {
        ...base,
        status: error.startsWith('BLOCKED:') ? 'blocked' : 'failed',
        error,
      };
    }
  },

  async crawl(url: string, overrides: Partial<CrawlOptions> = {}): Promise<WebDocumentData[]> {
    const options = { ...DEFAULT_CRAWL_OPTIONS, ...overrides };

    // The seed guard can throw (private host, DNS failure). Return a failed document
    // instead, so one hostile domain cannot abort the whole research job.
    let seed: URL;
    try {
      seed = await assertSafeUrl(url);
    } catch (err) {
      const error = (err as Error).message;
      log.warn({ url, error }, 'crawl seed rejected');
      return [
        {
          url,
          headings: [],
          content: '',
          links: [],
          emails: [],
          phones: [],
          socialLinks: [],
          contentHash: '',
          sourceType: 'website',
          status: 'failed',
          retrievedAt: new Date().toISOString(),
          provider: 'internal',
          error,
        },
      ];
    }
    const domain = seed.hostname.replace(/^www\./, '');

    const first = await this.fetch(seed.toString(), options);
    if (first.status !== 'success') return [first];

    const seen = new Set<string>([normalizeUrl(first.url)]);
    const queue: string[] = first.links
      .filter((l) => {
        try {
          return new URL(l).hostname.replace(/^www\./, '') === domain;
        } catch {
          return false;
        }
      })
      .sort((a, b) => rankLink(a) - rankLink(b))
      .slice(0, options.maxPages - 1);

    const documents = [first];
    while (queue.length > 0 && documents.length < options.maxPages) {
      const next = queue.shift()!;
      const normalized = normalizeUrl(next);
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      const doc = await this.fetch(next, options);
      documents.push(doc);
      if (doc.status !== 'success') continue;
    }

    log.info({ domain, pages: documents.length }, 'crawl complete');
    return documents;
  },
};

export function resetCrawlerState(): void {
  hostQueues.clear();
  robotsCache.clear();
}
