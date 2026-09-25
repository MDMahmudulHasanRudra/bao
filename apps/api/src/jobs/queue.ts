import { Queue, Worker } from 'bullmq';
import { getRedis } from '../redis/index.js';
import { createChildLogger } from '../core/logging/logger.js';

const log = createChildLogger('jobs');

const connection = () => getRedis();

export function createQueue(name: string) {
  return new Queue(name, { connection: connection() });
}

export interface JobMeta {
  /** 1 on the first attempt. */
  attemptsMade: number;
  /** 0 when the queue used the BullMQ default. */
  maxAttempts: number;
  isFinalAttempt: boolean;
}

export function createWorker(
  name: string,
  processor: (jobData: Record<string, unknown>, meta: JobMeta) => Promise<void>,
) {
  const worker = new Worker(
    name,
    async (job) => {
      log.info({ job: job.name, id: job.id }, `Processing job ${name}`);
      const maxAttempts = job.opts.attempts ?? 1;
      const attemptsMade = job.attemptsMade + 1;
      try {
        await processor(job.data as Record<string, unknown>, {
          attemptsMade,
          maxAttempts,
          isFinalAttempt: attemptsMade >= maxAttempts,
        });
        log.info({ job: job.name, id: job.id }, `Job ${name} completed`);
      } catch (err) {
        log.error({ job: job.name, id: job.id, err }, `Job ${name} failed`);
        throw err;
      }
    },
    { connection: connection() },
  );

  worker.on('failed', (job, err) => {
    log.error({ job: job?.name, id: job?.id, err }, `Job ${name} failed permanently`);
  });

  return worker;
}
