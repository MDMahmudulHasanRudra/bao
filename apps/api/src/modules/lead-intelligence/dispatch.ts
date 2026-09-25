import type { JobsOptions } from 'bullmq';
import { createChildLogger } from '../../core/logging/logger.js';
import { createQueue } from '../../jobs/queue.js';
import { updateJobStatus } from './service.js';

const log = createChildLogger('lead-intelligence');

export const RESEARCH_QUEUE = 'lead-intelligence-research';

/** Section 55: bounded attempts, exponential backoff, dead-letter after exhaustion. */
const JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
};

let queue: ReturnType<typeof createQueue> | null = null;

function getQueue() {
  if (!queue) queue = createQueue(RESEARCH_QUEUE);
  return queue;
}

export async function enqueueResearchJob(jobId: string): Promise<void> {
  const queued = await getQueue().add('research', { jobId }, JOB_OPTIONS);
  log.info({ jobId, queueId: queued.id }, 'research job enqueued');
}

/** Only used by the worker's final step so a Redis hiccup never leaves a job 'running' forever. */
export async function markJobDead(jobId: string, error: string): Promise<void> {
  log.error({ jobId, error }, 'research job exhausted retries');
  await updateJobStatus(jobId, 'failed', error);
}
