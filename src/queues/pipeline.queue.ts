import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";
import type { CollectOptions, PipelineRunInput } from "../types";

export type PipelineJob =
  | {
      type: "pipeline.run";
      input: PipelineRunInput;
      requestId?: string;
    }
  | {
      type: "trends.collect";
      input: CollectOptions;
      requestId?: string;
    };

export const pipelineQueue = new Queue<PipelineJob>("trend-domain-pipeline", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

export const enqueuePipelineRun = (input: PipelineRunInput, requestId?: string) =>
  pipelineQueue.add("pipeline.run", { type: "pipeline.run", input, requestId });

export const enqueueTrendCollection = (input: CollectOptions, requestId?: string) =>
  pipelineQueue.add("trends.collect", { type: "trends.collect", input, requestId });
