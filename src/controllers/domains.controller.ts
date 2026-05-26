import type { Request, Response } from "express";
import type { DomainCandidate } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { domainService } from "../services/domain.service";
import { sendSuccess } from "../utils/apiResponse";
import { AppError } from "../utils/errors";
import { getPagination, paginated } from "../utils/pagination";

const generateSchema = z.object({
  narrativeIds: z.array(z.string().uuid()).optional(),
  maxDomains: z.number().int().positive().max(100).optional(),
  checkAvailability: z.boolean().optional().default(false)
});

const checkSchema = z
  .object({
    domain: z.string().min(3).optional(),
    id: z.string().uuid().optional()
  })
  .refine((value) => value.domain || value.id, "Provide either domain or id.");

const bulkCheckSchema = z.object({
  domains: z.array(z.string().min(3)).max(250).optional(),
  ids: z.array(z.string().uuid()).max(250).optional()
});

export const domainsController = {
  generate: async (req: Request, res: Response) => {
    const input = generateSchema.parse(req.body ?? {});
    const narratives = await prisma.narrative.findMany({
      where: input.narrativeIds?.length ? { id: { in: input.narrativeIds } } : undefined,
      orderBy: { overallScore: "desc" },
      take: input.narrativeIds?.length ? undefined : 10
    });

    const generated: DomainCandidate[] = [];
    for (const narrative of narratives) {
      const items = await domainService.generateForNarrativeRecord(
        narrative,
        input.maxDomains ?? env.MAX_DOMAINS_PER_NARRATIVE,
        input.checkAvailability
      );
      generated.push(...items);
    }

    sendSuccess(req, res, {
      count: generated.length,
      items: generated
    });
  },

  generateFromNarrative: async (req: Request, res: Response) => {
    const input = z
      .object({
        maxDomains: z.number().int().positive().max(100).optional(),
        checkAvailability: z.boolean().optional().default(false)
      })
      .parse(req.body ?? {});

    const generated = await domainService.generateFromNarrative(
      req.params.id,
      input.maxDomains ?? env.MAX_DOMAINS_PER_NARRATIVE,
      input.checkAvailability
    );

    sendSuccess(req, res, {
      count: generated.length,
      items: generated
    });
  },

  list: async (req: Request, res: Response) => {
    const { page, limit, skip } = getPagination(req.query);
    const filters = z
      .object({
        decision: z.enum(["BUY", "WATCH", "DROP", "UNREVIEWED"]).optional(),
        availableStatus: z.enum(["available", "registered", "unknown"]).optional(),
        trademarkRisk: z.enum(["low", "medium", "high"]).optional(),
        minScore: z.coerce.number().int().min(0).max(100).optional()
      })
      .parse(req.query);

    const where = {
      ...(filters.decision ? { decision: filters.decision } : {}),
      ...(filters.availableStatus ? { availableStatus: filters.availableStatus } : {}),
      ...(filters.trademarkRisk ? { trademarkRisk: filters.trademarkRisk } : {}),
      ...(filters.minScore ? { score: { gte: filters.minScore } } : {})
    };

    const [items, total] = await Promise.all([
      prisma.domainCandidate.findMany({
        where,
        include: { narrative: true },
        orderBy: { score: "desc" },
        skip,
        take: limit
      }),
      prisma.domainCandidate.count({ where })
    ]);

    sendSuccess(req, res, paginated(items, total, page, limit));
  },

  getById: async (req: Request, res: Response) => {
    const domain = await prisma.domainCandidate.findUnique({
      where: { id: req.params.id },
      include: {
        narrative: true,
        checks: { orderBy: { checkedAt: "desc" }, take: 10 }
      }
    });
    if (!domain) throw new AppError("Domain candidate not found.", 404, "DOMAIN_NOT_FOUND");
    sendSuccess(req, res, { item: domain });
  },

  check: async (req: Request, res: Response) => {
    const input = checkSchema.parse(req.body ?? {});
    const result = await domainService.checkAndUpdate(input.id ?? input.domain!);
    sendSuccess(req, res, result);
  },

  bulkCheck: async (req: Request, res: Response) => {
    const input = bulkCheckSchema.parse(req.body ?? {});
    const values = [...(input.ids ?? []), ...(input.domains ?? [])];
    const results = await domainService.bulkCheck(values);
    sendSuccess(req, res, {
      count: results.length,
      items: results
    });
  },

  top: async (req: Request, res: Response) => {
    const limit = z.coerce.number().int().positive().max(100).optional().default(25).parse(req.query.limit);
    const items = await prisma.domainCandidate.findMany({
      where: {
        decision: { in: ["BUY", "WATCH"] }
      },
      include: { narrative: true },
      orderBy: { score: "desc" },
      take: limit
    });
    sendSuccess(req, res, { items: items.map((item) => domainService.toBuyPayload(item)) });
  },

  buyList: async (req: Request, res: Response) => domainsController.listByDecision(req, res, "BUY"),
  watchList: async (req: Request, res: Response) => domainsController.listByDecision(req, res, "WATCH"),
  rejected: async (req: Request, res: Response) => domainsController.listByDecision(req, res, "DROP"),

  listByDecision: async (req: Request, res: Response, decision: "BUY" | "WATCH" | "DROP") => {
    const { page, limit, skip } = getPagination(req.query);
    const where = { decision };
    const [items, total] = await Promise.all([
      prisma.domainCandidate.findMany({
        where,
        include: { narrative: true },
        orderBy: { score: "desc" },
        skip,
        take: limit
      }),
      prisma.domainCandidate.count({ where })
    ]);
    sendSuccess(
      req,
      res,
      paginated(
        items.map((item) => domainService.toBuyPayload(item)),
        total,
        page,
        limit
      )
    );
  }
};
