import { getEnv } from '../../core/config/env.js';
import { createChildLogger } from '../../core/logging/logger.js';

const log = createChildLogger('diffy-adapter');

export interface ComparisonRequest {
  contentA: string;
  contentB: string;
  type: 'text' | 'code' | 'document';
  metadata?: Record<string, unknown>;
}

export interface ComparisonResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  score?: number;
  summary?: string;
  differences?: Array<{
    type: 'addition' | 'deletion' | 'modification';
    content: string;
    location?: string;
  }>;
  error?: string;
}

export async function createComparisonJob(request: ComparisonRequest): Promise<ComparisonResult> {
  const env = getEnv();

  if (!env.DIFFY_API_URL || !env.DIFFY_API_KEY) {
    log.warn('Diffy not configured');
    return {
      jobId: `mock-${Date.now()}`,
      status: 'completed',
      score: 0.85,
      summary: '[Diffy not configured - mock comparison]',
      differences: [],
    };
  }

  try {
    const response = await fetch(`${env.DIFFY_API_URL}/v1/compare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DIFFY_API_KEY}`,
      },
      body: JSON.stringify({
        content_a: request.contentA,
        content_b: request.contentB,
        type: request.type,
      }),
    });

    if (!response.ok) throw new Error(`Diffy API error: ${response.status}`);
    const data = (await response.json()) as { job_id: string };

    return { jobId: data.job_id, status: 'pending' };
  } catch (err) {
    log.error({ err }, 'Failed to create comparison job');
    throw err;
  }
}

export async function getComparisonResult(jobId: string): Promise<ComparisonResult> {
  const env = getEnv();

  if (!env.DIFFY_API_URL || !env.DIFFY_API_KEY) {
    return { jobId, status: 'completed', score: 0.85, summary: '[Mock result]' };
  }

  try {
    const response = await fetch(`${env.DIFFY_API_URL}/v1/compare/${jobId}`, {
      headers: {
        Authorization: `Bearer ${env.DIFFY_API_KEY}`,
      },
    });

    if (!response.ok) throw new Error(`Diffy API error: ${response.status}`);
    const data = (await response.json()) as {
      status: string;
      score?: number;
      summary?: string;
      differences?: ComparisonResult['differences'];
      error?: string;
    };

    return {
      jobId,
      status: data.status as ComparisonResult['status'],
      score: data.score,
      summary: data.summary,
      differences: data.differences,
      error: data.error,
    };
  } catch (err) {
    log.error({ err, jobId }, 'Failed to get comparison result');
    throw err;
  }
}
