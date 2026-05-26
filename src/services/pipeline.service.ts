import type { DomainCandidate, Narrative } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { domainService } from "./domain.service";
import { narrativeService } from "./narrative.service";
import { trendCollectionService } from "./trendCollection.service";
import type { PipelineRunInput } from "../types";

export class PipelineService {
  async run(input: PipelineRunInput, requestId?: string) {
    const run = await prisma.pipelineRun.create({
      data: {
        requestId,
        input: input as never,
        status: "RUNNING"
      }
    });

    try {
      const trends = await trendCollectionService.collectAndPersist({
        sources: input.sources,
        categories: input.categories,
        subreddits: input.subreddits,
        limitPerSource: env.COLLECT_LIMIT_PER_SOURCE
      });

      const extractionPool =
        trends.length > 0
          ? trends
          : await prisma.rawTrend.findMany({
              orderBy: { collectedAt: "desc" },
              take: 100
            });

      const narratives = await narrativeService.extractAndPersist(
        extractionPool,
        input.maxNarratives ?? 10
      );

      const scoredNarratives: Narrative[] = [];
      for (const narrative of narratives) {
        scoredNarratives.push(await narrativeService.scoreAndUpdate(narrative));
      }

      const generatedGroups: DomainCandidate[][] = [];
      for (const narrative of scoredNarratives) {
        generatedGroups.push(
          await domainService.generateForNarrativeRecord(
            narrative,
            input.domainsPerNarrative ?? env.MAX_DOMAINS_PER_NARRATIVE,
            input.checkAvailability ?? true
          )
        );
      }

      const generated = generatedGroups.flat();
      const domains = await prisma.domainCandidate.findMany({
        where: {
          id: { in: generated.map((domain) => domain.id) }
        },
        include: { narrative: true },
        orderBy: [{ decision: "asc" }, { score: "desc" }]
      });

      const buyCandidates = domains
        .filter((domain) => domain.decision === "BUY")
        .sort((a, b) => b.score - a.score)
        .map((domain) => domainService.toBuyPayload(domain));

      const watchCandidates = domains
        .filter((domain) => domain.decision === "WATCH")
        .sort((a, b) => b.score - a.score)
        .map((domain) => domainService.toBuyPayload(domain));

      const rejected = domains
        .filter((domain) => domain.decision === "DROP")
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
        .map((domain) => domainService.toBuyPayload(domain));

      const summary = {
        rawTrendsCollected: trends.length,
        narrativesExtracted: narratives.length,
        domainsGenerated: generated.length,
        availableDomains: domains.filter((domain) => domain.availableStatus === "available").length,
        buyCandidates: buyCandidates.length,
        watchCandidates: watchCandidates.length
      };

      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          summary: summary as never,
          finishedAt: new Date()
        }
      });

      return {
        runId: run.id,
        summary,
        buyCandidates,
        watchCandidates,
        rejected
      };
    } catch (error) {
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown pipeline error",
          finishedAt: new Date()
        }
      });
      throw error;
    }
  }
}

export const pipelineService = new PipelineService();
