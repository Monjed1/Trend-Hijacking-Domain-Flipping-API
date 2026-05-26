import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { narrativeService } from "../services/narrative.service";
import { sendSuccess } from "../utils/apiResponse";
import { AppError } from "../utils/errors";
import { getPagination, paginated } from "../utils/pagination";

const extractSchema = z.object({
  trendIds: z.array(z.string().uuid()).optional(),
  maxNarratives: z.number().int().positive().max(50).optional().default(10)
});

export const narrativesController = {
  extract: async (req: Request, res: Response) => {
    const input = extractSchema.parse(req.body ?? {});
    const rawTrends = await prisma.rawTrend.findMany({
      where: input.trendIds?.length ? { id: { in: input.trendIds } } : undefined,
      orderBy: { collectedAt: "desc" },
      take: input.trendIds?.length ? undefined : 100
    });

    const narratives = await narrativeService.extractAndPersist(rawTrends, input.maxNarratives);
    sendSuccess(req, res, {
      count: narratives.length,
      items: narratives
    });
  },

  list: async (req: Request, res: Response) => {
    const { page, limit, skip } = getPagination(req.query);
    const filters = z
      .object({
        category: z.string().optional(),
        minScore: z.coerce.number().int().min(0).max(100).optional()
      })
      .parse(req.query);

    const where = {
      ...(filters.category ? { category: { contains: filters.category, mode: "insensitive" as const } } : {}),
      ...(filters.minScore ? { overallScore: { gte: filters.minScore } } : {})
    };

    const [items, total] = await Promise.all([
      prisma.narrative.findMany({
        where,
        orderBy: { overallScore: "desc" },
        skip,
        take: limit
      }),
      prisma.narrative.count({ where })
    ]);

    sendSuccess(req, res, paginated(items, total, page, limit));
  },

  getById: async (req: Request, res: Response) => {
    const narrative = await prisma.narrative.findUnique({
      where: { id: req.params.id },
      include: {
        domains: {
          orderBy: { score: "desc" },
          take: 100
        }
      }
    });
    if (!narrative) throw new AppError("Narrative not found.", 404, "NARRATIVE_NOT_FOUND");
    sendSuccess(req, res, { item: narrative });
  },

  score: async (req: Request, res: Response) => {
    const narrative = await prisma.narrative.findUnique({ where: { id: req.params.id } });
    if (!narrative) throw new AppError("Narrative not found.", 404, "NARRATIVE_NOT_FOUND");
    const scored = await narrativeService.scoreAndUpdate(narrative);
    sendSuccess(req, res, { item: scored });
  }
};
