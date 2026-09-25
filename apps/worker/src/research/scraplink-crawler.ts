import type { CrawlOptions, CrawlerProvider, WebDocumentData } from '@bao/contracts';
import { loadEnv } from '@bao/config';
import { getLogger } from '../logger.js';
import { assertSafeUrl } from '../net/safe-url.js';
import { contentHash } from './extract.js';

const env = loadEnv();
const log = getLogger('worker-scraplink-crawler');

/** Unconfigured ScrapLink must never produce content — a mock page would become
 *  "evidence" and then a lead, which is exactly the false-failure the plan forbids. */
export function scraplinkConfigured(): boolean {
  return Boolean(env.SCRAPLINK_API_URL && env.SCRAPLINK_API_KEY);
}

function failed(url: string, status: WebDocumentData['status'], error: string): WebDocumentData {
  return {
    url,
    headings: [],
    content: '',
    links: [],
    emails: [],
    phones: [],
    socialLinks: [],
    contentHash: '',
    sourceType: 'website',
    status,
    retrievedAt: new Date().toISOString(),
    provider: 'scraplink',
    error,
  };
}

export const scraplinkCrawler: CrawlerProvider = {
  id: 'scraplink',

  async fetch(url: string): Promise<WebDocumentData> {
    if (!scraplinkConfigured()) return failed(url, 'failed', 'ScrapLink is not configured');
    const safe = await assertSafeUrl(url);

    try {
      const created = await fetch(`${env.SCRAPLINK_API_URL}/v1/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.SCRAPLINK_API_KEY}`,
        },
        body: JSON.stringify({ url: safe.toString() }),
        signal: AbortSignal.timeout(env.CRAWLER_REQUEST_TIMEOUT),
      });
      if (!created.ok) throw new Error(`SCRAPLINK_ERROR:${created.status}`);
      const { job_id: jobId } = (await created.json()) as { job_id: string };

      // poll briefly, then give up rather than hold a worker slot
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch(`${env.SCRAPLINK_API_URL}/v1/scrape/${jobId}`, {
          headers: { Authorization: `Bearer ${env.SCRAPLINK_API_KEY}` },
          signal: AbortSignal.timeout(env.CRAWLER_REQUEST_TIMEOUT),
        });
        if (!res.ok) throw new Error(`SCRAPLINK_ERROR:${res.status}`);
        const data = (await res.json()) as { status: string; content?: string; error?: string };
        if (data.status === 'completed') {
          const content = data.content?.trim();
          if (!content) return failed(url, 'failed', 'ScrapLink returned no content');
          return {
            url: safe.toString(),
            content,
            headings: [],
            links: [],
            emails: [],
            phones: [],
            socialLinks: [],
            contentHash: contentHash(content),
            sourceType: 'website',
            status: 'success',
            retrievedAt: new Date().toISOString(),
            provider: 'scraplink',
          };
        }
        if (data.status === 'failed') return failed(url, 'failed', data.error || 'Scrape failed');
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
      return failed(url, 'failed', 'ScrapLink job timed out');
    } catch (err) {
      const error = (err as Error).message;
      log.warn({ url: safe.toString(), error }, 'scraplink crawl failed');
      return failed(url, 'failed', error);
    }
  },

  async crawl(url: string, options: Partial<CrawlOptions> = {}): Promise<WebDocumentData[]> {
    // ScrapLink renders one page per job; multi-page depth stays with the internal crawler.
    void options;
    return [await this.fetch(url)];
  },
};
