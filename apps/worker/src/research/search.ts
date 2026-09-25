import type { SearchOptions, SearchProvider, SearchResult } from '@bao/contracts';
import { loadEnv } from '@bao/config';
import { getLogger } from '../logger.js';

const env = loadEnv();
const log = getLogger('worker-search');

const ALLOWED_PROVIDERS = new Set(['brave', 'serper']);

export function searchConfigured(): boolean {
  return Boolean(env.SEARCH_PROVIDER && env.SEARCH_API_KEY);
}

interface RawResult {
  url?: string;
  link?: string;
  title?: string;
  name?: string;
  description?: string;
  snippet?: string;
}

function toResult(raw: RawResult, rank: number): SearchResult | null {
  const url = raw.url || raw.link;
  if (!url) return null;
  let source: string;
  try {
    source = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  return {
    url,
    title: (raw.title || raw.name || source).slice(0, 200),
    snippet: (raw.description || raw.snippet || '').slice(0, 500),
    source,
    rank,
  };
}

/**
 * Section 12: no broad silent fallback. With no provider configured, search returns
 * nothing and the job falls back to user-supplied seed domains/URLs.
 */
export const httpSearchProvider: SearchProvider = {
  id: env.SEARCH_PROVIDER || 'none',

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!searchConfigured()) {
      log.info('search provider not configured; relying on seed domains');
      return [];
    }
    const provider = (env.SEARCH_PROVIDER || '').toLowerCase();
    if (!ALLOWED_PROVIDERS.has(provider)) {
      log.warn({ provider }, 'unknown search provider; refusing to guess an API shape');
      return [];
    }

    const limit = Math.min(options.limit ?? 10, 20);
    try {
      const apiKey = env.SEARCH_API_KEY as string;
      const url =
        provider === 'brave'
          ? `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`
          : `https://google.serper.dev/search?q=${encodeURIComponent(query)}&num=${limit}`;

      const res = await fetch(url, {
        headers:
          provider === 'brave'
            ? { 'X-Subscription-Token': apiKey, Accept: 'application/json' }
            : { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        log.warn({ provider, status: res.status }, 'search request failed');
        return [];
      }

      const body = (await res.json()) as { web?: { results?: RawResult[] }; organic?: RawResult[] };
      const raw = body.web?.results ?? body.organic ?? [];
      return raw
        .map((r, index) => toResult(r, index + 1))
        .filter((r): r is SearchResult => r !== null);
    } catch (err) {
      log.warn({ err, provider }, 'search failed');
      return [];
    }
  },
};
