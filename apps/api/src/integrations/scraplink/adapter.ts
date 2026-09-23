import { getEnv } from '../../core/config/env.js';
import { createChildLogger } from '../../core/logging/logger.js';

const log = createChildLogger('scraplink-adapter');

export interface ScrapeRequest {
  url: string;
  selectors?: Record<string, string>;
  waitFor?: number;
  metadata?: Record<string, unknown>;
}

export interface ScrapeResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  content?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export async function createScrapeJob(request: ScrapeRequest): Promise<ScrapeResult> {
  const env = getEnv();

  if (!env.SCRAPLINK_API_URL || !env.SCRAPLINK_API_KEY) {
    log.warn('ScrapLink not configured');
    return {
      jobId: `mock-${Date.now()}`,
      status: 'completed',
      content: '[ScrapLink not configured - mock content]',
    };
  }

  try {
    const response = await fetch(`${env.SCRAPLINK_API_URL}/v1/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SCRAPLINK_API_KEY}`,
      },
      body: JSON.stringify({
        url: request.url,
        selectors: request.selectors,
        wait_for: request.waitFor,
      }),
    });

    if (!response.ok) throw new Error(`ScrapLink API error: ${response.status}`);
    const data = (await response.json()) as { job_id: string };

    return { jobId: data.job_id, status: 'pending' };
  } catch (err) {
    log.error({ err }, 'Failed to create scrape job');
    throw err;
  }
}

export async function getScrapeResult(jobId: string): Promise<ScrapeResult> {
  const env = getEnv();

  if (!env.SCRAPLINK_API_URL || !env.SCRAPLINK_API_KEY) {
    return { jobId, status: 'completed', content: '[Mock content]' };
  }

  try {
    const response = await fetch(`${env.SCRAPLINK_API_URL}/v1/scrape/${jobId}`, {
      headers: {
        Authorization: `Bearer ${env.SCRAPLINK_API_KEY}`,
      },
    });

    if (!response.ok) throw new Error(`ScrapLink API error: ${response.status}`);
    const data = (await response.json()) as {
      status: string;
      content?: string;
      data?: Record<string, unknown>;
      error?: string;
    };

    return {
      jobId,
      status: data.status as ScrapeResult['status'],
      content: data.content,
      data: data.data,
      error: data.error,
    };
  } catch (err) {
    log.error({ err, jobId }, 'Failed to get scrape result');
    throw err;
  }
}
