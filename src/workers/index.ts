import { Worker } from "bullmq";
import { logger } from "../config/logger";
import { redisConnection } from "../config/redis";
import { prisma } from "../config/prisma";
import type { PipelineJob } from "../queues/pipeline.queue";
import { pipelineService } from "../services/pipeline.service";
import { trendCollectionService } from "../services/trendCollection.service";

const worker = new Worker<PipelineJob>(
  "trend-domain-pipeline",
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "Worker started job");

    if (job.data.type === "pipeline.run") {
      return pipelineService.run(job.data.input, job.data.requestId);
    }

    if (job.data.type === "trends.collect") {
      return trendCollectionService.collectAndPersist(job.data.input);
    }

    throw new Error(`Unsupported job type: ${(job.data as { type?: string }).type}`);
  },
  {
    connection: redisConnection,
    concurrency: 2
  }
);

worker.on("completed", (job) => logger.info({ jobId: job.id, name: job.name }, "Worker completed job"));
worker.on("failed", (job, error) => logger.error({ jobId: job?.id, error }, "Worker job failed"));

const shutdown = async () => {
  logger.info("Stopping worker");
  await worker.close();
  await prisma.$disconnect();
  await redisConnection.quit();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
