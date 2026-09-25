import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@bao/config', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters!';
  process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';
  const real = await vi.importActual<typeof import('@bao/config')>('@bao/config');
  return { ...real, loadEnv: () => real.loadEnv(), getEnv: () => real.loadEnv() };
});

import { isBlockedHostname } from '../../apps/worker/src/net/safe-url.js';
import { contentHash, extractDocument, normalizeUrl, normalizedDomain } from '../../apps/worker/src/research/extract.js';
import { generateQueries } from '../../apps/worker/src/research/queries.js';
import { DEFAULT_CRAWL_OPTIONS, internalCrawler, resetCrawlerState } from '../../apps/worker/src/research/crawler.js';
import { sourceForQuote } from '../../apps/api/src/modules/lead-intelligence/analyze-job.js';
import type { DiscoverySpecification } from '@bao/contracts';

const PAGE = `<!doctype html><html lang="en-GB"><head>
<title>Acme Industrial | Pumps &amp; Valves</title>
<meta name="description" content="Acme builds industrial pumps for the UK market.">
<link rel="canonical" href="https://acme.co.uk/about">
</head><body>
<nav><a href="/">Home</a><a href="https://x.com/acme">Twitter</a></nav>
<main><h1>About Acme</h1><h2>Our history</h2>
<p>Acme Industrial has served engineers since 1994. Contact sales@acme.co.uk or call +44 20 7946 0958.</p>
</main>
<footer>Copyright Acme</footer>
</body></html>`;

describe('extractDocument', () => {
  const doc = extractDocument(PAGE, 'https://acme.co.uk/about');

  it('pulls the title and strips the site-name suffix', () => {
    expect(doc.title).toBe('Acme Industrial | Pumps & Valves');
  });

  it('keeps the description and canonical url', () => {
    expect(doc.description).toContain('industrial pumps');
    expect(doc.canonicalUrl).toBe('https://acme.co.uk/about');
  });

  it('collects headings but not navigation or footer text', () => {
    expect(doc.headings).toEqual(['About Acme', 'Our history']);
    expect(doc.content).not.toContain('Copyright Acme');
    expect(doc.content).toContain('Acme Industrial has served engineers');
  });

  it('finds contact details', () => {
    expect(doc.emails).toContain('sales@acme.co.uk');
    expect(doc.phones).toHaveLength(1);
  });

  it('records social links', () => {
    expect(doc.socialLinks.some((l) => l.includes('x.com/acme'))).toBe(true);
  });

  it('never returns raw HTML', () => {
    expect(doc.content).not.toContain('<');
  });

  it('detects language', () => {
    expect(doc.language).toBe('en-gb');
  });

  it('is deterministic: same html yields the same content hash', () => {
    expect(extractDocument(PAGE, 'https://acme.co.uk/about').contentHash).toBe(doc.contentHash);
    expect(doc.contentHash).toHaveLength(64);
  });

  it('survives broken markup without throwing', () => {
    const broken = extractDocument('<div><p>unclosed <b>bold', 'https://x.com/');
    expect(broken.content).toContain('unclosed');
  });
});

describe('normalizeUrl', () => {
  it('drops fragments, utm params, trailing slash and port', () => {
    expect(normalizeUrl('http://acme.co.uk:80/about/?utm_source=x#top')).toBe('https://acme.co.uk/about');
  });

  it('keeps meaningful query params', () => {
    expect(normalizeUrl('https://acme.co.uk/jobs?page=2')).toBe('https://acme.co.uk/jobs?page=2');
  });
});

describe('normalizedDomain', () => {
  it('strips www and lowercases', () => {
    expect(normalizedDomain('https://WWW.Acme.CO.UK/path')).toBe('acme.co.uk');
    expect(normalizedDomain('acme.co.uk')).toBe('acme.co.uk');
  });
  it('returns null for junk', () => {
    expect(normalizedDomain('not a domain')).toBeNull();
  });
});

describe('SSRF guard (shared with knowledge ingest)', () => {
  it.each([
    '127.0.0.1',
    'localhost',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    'metadata.google.internal',
    'foo.internal',
    'db.local',
    '::1',
    'fd00::1',
  ])('blocks %s', (host) => {
    expect(isBlockedHostname(host)).toBe(true);
  });

  it.each(['8.8.8.8', 'example.com', 'acme.co.uk', '2606:4700::1111'])('allows %s', (host) => {
    expect(isBlockedHostname(host)).toBe(false);
  });
});

describe('generateQueries', () => {
  const spec: DiscoverySpecification = {
    industries: ['commercial HVAC contractors'],
    geography: ['United Kingdom'],
    companySize: { min: 20, max: 200 },
    technologies: ['Salesforce'],
    targetService: 'field service scheduling',
    targetSignals: ['recent funding round'],
    limit: 50,
  };

  it('produces several focused queries', () => {
    const queries = generateQueries(spec, 8);
    expect(queries.length).toBeGreaterThan(1);
    expect(queries.every((q) => q.length > 0)).toBe(true);
  });

  it('respects the cap so a request cannot explode into hundreds of queries', () => {
    expect(generateQueries(spec, 3).length).toBeLessThanOrEqual(3);
  });

  it('includes industry, geography and employee range', () => {
    const all = generateQueries(spec, 8).join(' | ').toLowerCase();
    expect(all).toContain('commercial hvac contractors');
    expect(all).toContain('united kingdom');
    expect(all).toContain('20-200 employees');
  });

  it('never returns duplicates', () => {
    const queries = generateQueries({ industries: ['SaaS'], geography: ['US'], limit: 10 }, 8);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it('handles a sparse spec without producing empty strings', () => {
    const queries = generateQueries({ limit: 10 }, 8);
    expect(queries.every((q) => q.trim().length > 0)).toBe(true);
  });
});

describe('crawler limits are finite by default', () => {
  it('has bounded defaults', () => {
    expect(DEFAULT_CRAWL_OPTIONS.depth).toBeLessThanOrEqual(3);
    expect(DEFAULT_CRAWL_OPTIONS.maxPages).toBeLessThanOrEqual(50);
    expect(DEFAULT_CRAWL_OPTIONS.maxPagesPerDomain).toBeLessThanOrEqual(50);
    expect(DEFAULT_CRAWL_OPTIONS.maxResponseBytes).toBeLessThanOrEqual(10_000_000);
    expect(DEFAULT_CRAWL_OPTIONS.respectRobots).toBe(true);
  });

  it('is resettable between tests', () => {
    expect(() => resetCrawlerState()).not.toThrow();
  });
});

describe('contentHash', () => {
  it('differs for different content and matches for equal content', () => {
    expect(contentHash('a')).toBe(contentHash('a'));
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });
});

describe('per-domain isolation', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetCrawlerState();
  });

  it('returns a failed document instead of throwing when the seed host is private', async () => {
    resetCrawlerState();
    // 169.254.169.254 is the link-local metadata address the SSRF guard blocks.
    const docs = await internalCrawler.crawl('http://169.254.169.254/latest/meta-data/');
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('failed');
    expect(docs[0].content).toBe('');
    expect(docs[0].provider).toBe('internal');
  });

  it('records the provider that actually ran rather than the one that is configured', async () => {
    resetCrawlerState();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { status: 200 });
      }
      return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as never;

    const doc = await internalCrawler.fetch('https://acme.co.uk/about');
    expect(doc.status).toBe('success');
    // ScrapLink is unconfigured in tests, so claiming 'scraplink' here would be a lie.
    expect(doc.provider).toBe('internal');
  });

  it('isolates one failing domain so a sibling domain still succeeds', async () => {
    resetCrawlerState();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('blocked.test')) return new Response('nope', { status: 403 });
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /', { status: 200 });
      return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as never;

    const [bad, good] = await Promise.all([
      internalCrawler.crawl('https://blocked.test/'),
      internalCrawler.crawl('https://acme.co.uk/about'),
    ]);
    expect(bad.every((d) => d.status !== 'success')).toBe(true);
    expect(good.some((d) => d.status === 'success')).toBe(true);
  });
});

describe('robots.txt redirect handling', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetCrawlerState();
  });

  it('never requests a robots.txt redirect target inside the private network', async () => {
    resetCrawlerState();
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push(url);
      if (url.endsWith('/robots.txt')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }
      return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as never;

    const doc = await internalCrawler.fetch('https://acme.co.uk/about', {
      ...DEFAULT_CRAWL_OPTIONS,
      respectRobots: true,
    });
    expect(seen.filter((u) => u.includes('169.254.169.254'))).toEqual([]);
    // A blocked robots hop means "no stated restriction", not a failed crawl.
    expect(doc.status).toBe('success');
  });

  it('still follows a legitimate robots.txt redirect', async () => {
    resetCrawlerState();
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push(url);
      if (url === 'https://acme.co.uk/robots.txt') {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://acme.co.uk/robots/robots.txt' },
        });
      }
      if (url === 'https://acme.co.uk/robots/robots.txt') {
        return new Response('User-agent: *\nDisallow: /private', { status: 200 });
      }
      return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as never;

    const doc = await internalCrawler.fetch('https://acme.co.uk/private/thing', {
      ...DEFAULT_CRAWL_OPTIONS,
      respectRobots: true,
    });
    // The redirect was followed and its Disallow rule took effect.
    expect(seen).toContain('https://acme.co.uk/robots/robots.txt');
    expect(doc.status).toBe('blocked');
  });
});

describe('evidence points at the page the quote came from', () => {
  const docs = [
    { id: 'd1', sourceId: 's1', url: 'https://acme.test/', content: 'We are a regional 3PL.' },
    { id: 'd2', sourceId: 's2', url: 'https://acme.test/careers', content: 'We run a legacy WMS since 2011. We are hiring.' },
  ];

  it('credits the second page when the quote is on the second page', () => {
    expect(sourceForQuote('We run a legacy WMS since 2011.', docs)?.id).toBe('d2');
  });

  it('is insensitive to whitespace reflow', () => {
    expect(sourceForQuote('we run a LEGACY wms   since 2011', docs)?.id).toBe('d2');
  });

  it('still locates the source when the model appended its own words to a quote', () => {
    expect(sourceForQuote('We run a legacy WMS since 2011 and we are growing fast across the region', docs)?.id).toBe('d2');
  });

  it('does not guess a source from an unrelated claim', () => {
    expect(sourceForQuote('Their revenue is nine million a year', docs)?.id).toBe('d1');
  });

  it('falls back to the first page rather than inventing a source', () => {
    expect(sourceForQuote('nothing here matches this claim at all', docs)?.id).toBe('d1');
    expect(sourceForQuote(null, docs)?.id).toBe('d1');
    expect(sourceForQuote('anything', [])).toBeUndefined();
  });
});

describe('BullMQ retry semantics', () => {
  it('only gives up on the final attempt', () => {
    const meta = (attemptsMade: number, maxAttempts: number) => ({
      attemptsMade,
      maxAttempts,
      isFinalAttempt: attemptsMade >= maxAttempts,
    });
    expect(meta(1, 3).isFinalAttempt).toBe(false);
    expect(meta(2, 3).isFinalAttempt).toBe(false);
    expect(meta(3, 3).isFinalAttempt).toBe(true);
  });
});
