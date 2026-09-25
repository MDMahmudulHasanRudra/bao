import type { Worker } from 'bullmq';
import { createChildLogger } from '../../core/logging/logger.js';
import { createWorker } from '../../jobs/queue.js';
import { processAnalysis } from './analyze-job.js';
import { updateJobStatus } from './service.js';

/** Must match the queue the crawl phase publishes to (apps/worker/src/research/job.ts). */
export const ANALYSIS_QUEUE = 'lead-intelligence-analyze';

const log = createChildLogger('lead-intelligence:analyze');

let worker: Worker | null = null;

/**
 * Runs in the API process because generateCompletion needs the org's decrypted provider
 * key, which only resolveOrgRun can obtain here.
 */
export function startAnalysisWorker(): Worker {
  if (worker) return worker;
  worker = createWorker(ANALYSIS_QUEUE, async (data, meta) => {
    try {
      await processAnalysis(data);
    } catch (err) {
      // Only give up once BullMQ has no attempts left. Marking the row failed on the
      // first error would make the retry a no-op: processAnalysis skips terminal
      // rows, so the retry would "succeed" without analysing anything.
      const jobId = String(data.jobId ?? '');
      if (jobId && meta.isFinalAttempt) {
        log.error(
          { jobId, attemptsMade: meta.attemptsMade, err: err instanceof Error ? err.message : err },
          'analysis gave up after retries',
        );
        await updateJobStatus(jobId, 'failed', 'AI analysis failed after retries');
      } else {
        log.warn(
          { jobId, attemptsMade: meta.attemptsMade, err: err instanceof Error ? err.message : err },
          'analysis attempt failed, retrying',
        );
      }
      throw err;
    }
  });
  return worker;
}

export async function stopAnalysisWorker(): Promise<void> {
  if (!worker) return;
  await worker.close();
  worker = null;
}
