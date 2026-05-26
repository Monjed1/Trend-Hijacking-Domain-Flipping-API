import type { Request, Response } from "express";
import { z } from "zod";
import { enqueuePipelineRun } from "../queues/pipeline.queue";
import { trendSourceSchema } from "../schemas/source.schema";
import { pipelineService } from "../services/pipeline.service";
import { sendSuccess, getRequestId } from "../utils/apiResponse";

const pipelineRunSchema = z.object({
  sources: z.array(trendSourceSchema).optional(),
  categories: z.array(z.string().min(1)).optional(),
  subreddits: z.array(z.string().min(1)).optional(),
  maxNarratives: z.number().int().positive().max(50).optional(),
  domainsPerNarrative: z.number().int().positive().max(100).optional(),
  checkAvailability: z.boolean().optional().default(true),
  async: z.boolean().optional().default(false)
});

export const pipelineController = {
  run: async (req: Request, res: Response) => {
    const input = pipelineRunSchema.parse(req.body ?? {});
    const requestId = getRequestId(req);

    if (input.async) {
      const job = await enqueuePipelineRun(input, requestId);
      sendSuccess(req, res, { queued: true, jobId: job.id }, 202);
      return;
    }

    const result = await pipelineService.run(input, requestId);
    sendSuccess(req, res, result);
  }
};
