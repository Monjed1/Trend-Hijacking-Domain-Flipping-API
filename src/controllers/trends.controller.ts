import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { enqueueTrendCollection } from "../queues/pipeline.queue";
import { trendSourceSchema } from "../schemas/source.schema";
import { trendCollectionService } from "../services/trendCollection.service";
import { sendSuccess, getRequestId } from "../utils/apiResponse";
import { AppError } from "../utils/errors";
import { getPagination, paginated } from "../utils/pagination";

const collectSchema = z.object({
  sources: z.array(trendSourceSchema).optional(),
  categories: z.array(z.string().min(1)).optional(),
  subreddits: z.array(z.string().min(1)).optional(),
  limitPerSource: z.number().int().positive().max(100).optional(),
  async: z.boolean().optional().default(false)
});

export const trendsController = {
  collect: async (req: Request, res: Response) => {
    const input = collectSchema.parse(req.body ?? {});

    if (input.async) {
      const job = await enqueueTrendCollection(input, getRequestId(req));
      sendSuccess(req, res, { queued: true, jobId: job.id }, 202);
      return;
    }

    const trends = await trendCollectionService.collectAndPersist(input);
    sendSuccess(req, res, {
      count: trends.length,
      items: trends
    });
  },

  listRaw: async (req: Request, res: Response) => {
    const { page, limit, skip } = getPagination(req.query);
    const filters = z
      .object({
        source: trendSourceSchema.optional(),
        category: z.string().optional()
      })
      .parse(req.query);

    const where = {
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.category ? { category: { contains: filters.category, mode: "insensitive" as const } } : {})
    };

    const [items, total] = await Promise.all([
      prisma.rawTrend.findMany({
        where,
        orderBy: { collectedAt: "desc" },
        skip,
        take: limit
      }),
      prisma.rawTrend.count({ where })
    ]);

    sendSuccess(req, res, paginated(items, total, page, limit));
  },

  getRawById: async (req: Request, res: Response) => {
    const trend = await prisma.rawTrend.findUnique({ where: { id: req.params.id } });
    if (!trend) throw new AppError("Raw trend not found.", 404, "RAW_TREND_NOT_FOUND");
    sendSuccess(req, res, { item: trend });
  }
};
