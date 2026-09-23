import { loadEnv } from '@bao/config';
import { getLogger } from './logger.js';
import { getRedis } from './redis.js';
import { Worker } from 'bullmq';
import { processDocument, processUrl, closeSql } from './ingest.js';

const env = loadEnv();
const log = getLogger();

const connection = () => getRedis();

async function main() {
  log.info('Business AI OS Worker starting...');

  const redis = getRedis();
  await redis.ping();
  log.info('Redis connected');

  const documentWorker = new Worker(
    'knowledge-ingest',
    async (job) => {
      log.info({ job: job.name, id: job.id }, `Processing job ${job.name}`);
      try {
        if (job.name === 'process-document') {
          await processDocument(
            job.data as {
              sourceId: string;
              organizationId: string;
              storageKey: string;
              mimeType: string;
            },
          );
        } else if (job.name === 'process-url') {
          await processUrl(job.data as { sourceId: string; organizationId: string; url: string });
        }
        log.info({ job: job.name, id: job.id }, `Job ${job.name} completed`);
      } catch (err) {
        log.error({ job: job.name, id: job.id, err }, `Job ${job.name} failed`);
        throw err;
      }
    },
    { connection: connection() },
  );

  documentWorker.on('failed', (job, err) => {
    log.error({ job: job?.name, id: job?.id, err }, `Job ${job?.name} failed permanently`);
  });

  log.info({ nodeEnv: env.NODE_ENV }, 'Worker ready with document and URL processors');

  const shutdown = async () => {
    log.info('Worker shutting down...');
    await documentWorker.close();
    await closeSql();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  log.error(err, 'Worker failed to start');
  process.exit(1);
});
