import { getEnv } from '../../core/config/env.js';
import { createChildLogger } from '../../core/logging/logger.js';

const log = createChildLogger('presenton-adapter');

export interface PresentationRequest {
  title: string;
  content: string;
  templateId?: string;
  metadata?: Record<string, unknown>;
}

export interface PresentationJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  error?: string;
}

export async function createPresentationJob(
  request: PresentationRequest,
): Promise<PresentationJob> {
  const env = getEnv();

  if (!env.PRESENTON_API_URL || !env.PRESENTON_API_KEY) {
    log.warn('Presenton not configured');
    return {
      jobId: `mock-${Date.now()}`,
      status: 'completed',
      outputUrl: undefined,
    };
  }

  try {
    const response = await fetch(`${env.PRESENTON_API_URL}/v1/presentations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.PRESENTON_API_KEY}`,
      },
      body: JSON.stringify({
        title: request.title,
        content: request.content,
        template_id: request.templateId,
      }),
    });

    if (!response.ok) throw new Error(`Presenton API error: ${response.status}`);
    const data = (await response.json()) as { job_id: string };

    return { jobId: data.job_id, status: 'pending' };
  } catch (err) {
    log.error({ err }, 'Failed to create presentation job');
    throw err;
  }
}

export async function getPresentationStatus(jobId: string): Promise<PresentationJob> {
  const env = getEnv();

  if (!env.PRESENTON_API_URL || !env.PRESENTON_API_KEY) {
    return { jobId, status: 'completed', outputUrl: undefined };
  }

  try {
    const response = await fetch(`${env.PRESENTON_API_URL}/v1/presentations/${jobId}`, {
      headers: {
        Authorization: `Bearer ${env.PRESENTON_API_KEY}`,
      },
    });

    if (!response.ok) throw new Error(`Presenton API error: ${response.status}`);
    const data = (await response.json()) as {
      status: string;
      output_url?: string;
      error?: string;
    };

    return {
      jobId,
      status: data.status as PresentationJob['status'],
      outputUrl: data.output_url,
      error: data.error,
    };
  } catch (err) {
    log.error({ err, jobId }, 'Failed to get presentation status');
    throw err;
  }
}
