import type { CrawlerProvider, WebDocumentData } from '@bao/contracts';
import { getLogger } from '../logger.js';
import { internalCrawler } from './crawler.js';
import { normalizeUrl } from './extract.js';
import { scraplinkCrawler, scraplinkConfigured } from './scraplink-crawler.js';

const log = getLogger('worker-crawler-provider');

/** Resolved once at module load so the hot path has no branching. */
export const primaryCrawler: CrawlerProvider = scraplinkConfigured()
  ? scraplinkCrawler
  : internalCrawler;

/**
 * Section 78: retry/fall back rather than fail the job when one provider errors.
 * ScrapLink is primary when configured; the internal crawler is always the fallback.
 */
export async function crawlWithFallback(
  url: string,
  options?: Partial<Parameters<CrawlerProvider['fetch']>[1]>,
): Promise<WebDocumentData> {
  const merged = options ?? {};
  if (primaryCrawler === internalCrawler) return internalCrawler.fetch(url, merged);

  const primary = await primaryCrawler.fetch(url, merged);
  if (primary.status === 'success') return primary;

  log.info({ url, primary: primaryCrawler.id, error: primary.error }, 'primary crawler failed, falling back');
  return internalCrawler.fetch(url, merged);
}

/**
 * Multi-page crawl with an honest provider split.
 *
 * ScrapLink renders one page per job, so it can only supply the entry page; the
 * internal crawler still does link expansion for depth. When ScrapLink is not
 * configured, or when its entry page fails, the whole crawl falls back to internal
 * and every document records `provider: 'internal'`.
 */
export async function crawlManyWithFallback(
  url: string,
  options?: Partial<Parameters<CrawlerProvider['crawl']>[1]>,
): Promise<WebDocumentData[]> {
  if (primaryCrawler === internalCrawler) {
    return internalCrawler.crawl(url, options ?? {});
  }

  const primary = await primaryCrawler.fetch(url, options ?? {});
  if (primary.status !== 'success') {
    log.info({ url, error: primary.error }, 'scraplink entry page failed, crawling internally');
    return internalCrawler.crawl(url, options ?? {});
  }

  const merged = { ...(options ?? {}) };
  const internal = await internalCrawler.crawl(url, merged);
  const entry = normalizeUrl(primary.url);
  const rest = internal.filter((d) => normalizeUrl(d.url) !== entry);
  log.info(
    { url, entry: primary.provider, expanded: rest.length },
    'crawl complete with scraplink entry page',
  );
  return [primary, ...rest];
}
