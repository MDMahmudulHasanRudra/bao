import { Queue, Worker } from 'bullmq';
import { getRedis } from '../redis/index.js';
import { createChildLogger } from '../core/logging/logger.js';

const log = createChildLogger('jobs');

const connection = () => getRedis();

export function createQueue(name: string) {
  return new Queue(name, { connection: connection() });
}

export function createWorker(
  name: string,
  processor: (jobData: Record<string, unknown>) => Promise<void>,
) {
  const worker = new Worker(
    name,
    async (job) => {
      log.info({ job: job.name, id: job.id }, `Processing job ${name}`);
      try {
        await processor(job.data as Record<string, unknown>);
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
