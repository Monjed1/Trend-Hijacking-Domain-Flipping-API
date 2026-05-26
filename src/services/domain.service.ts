import type { DomainCandidate, Narrative } from "@prisma/client";
import { prisma } from "../config/prisma";
import { availabilityService } from "../domains/availability.service";
import { domainGeneratorService } from "../domains/generator.service";
import { domainScoringService } from "../domains/scoring.service";
import { socialHandleService } from "../domains/socialHandle.service";
import { trademarkService } from "../domains/trademark.service";
import type { AvailabilityResult, DomainScoreResult, GeneratedDomainIdea } from "../types";
import { AppError } from "../utils/errors";
import { mapLimit } from "../utils/text";
import { domainMarketService } from "./domainMarket.service";

const unknownAvailability = (domain: string): AvailabilityResult => ({
  domain,
  status: "unknown",
  confidence: "low",
  method: "none",
  raw: { note: "Availability check was skipped." }
});

const jsonArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export class DomainService {
  async generateFromNarrative(
    narrativeId: string,
    maxDomains: number,
    checkAvailability = false
  ): Promise<DomainCandidate[]> {
    const narrative = await prisma.narrative.findUnique({ where: { id: narrativeId } });
    if (!narrative) throw new AppError("Narrative not found.", 404, "NARRATIVE_NOT_FOUND");
    return this.generateForNarrativeRecord(narrative, maxDomains, checkAvailability);
  }

  async generateForNarrativeRecord(
    narrative: Narrative,
    maxDomains: number,
    checkAvailability = false
  ): Promise<DomainCandidate[]> {
    const ideas = await domainGeneratorService.generateForNarrative(narrative, maxDomains);
    const candidates = await mapLimit(ideas, checkAvailability ? 5 : 20, (idea) =>
      this.upsertIdea(idea, narrative, checkAvailability)
    );
    return candidates;
  }

  async checkAndUpdate(domainOrId: string): Promise<{ candidate: DomainCandidate | null; availability: AvailabilityResult }> {
    const existing = await prisma.domainCandidate.findFirst({
      where: {
        OR: [{ id: domainOrId }, { domain: domainOrId.toLowerCase() }]
      },
      include: { narrative: true }
    });

    const domain = existing?.domain ?? domainOrId.toLowerCase().trim();
    const availability = await availabilityService.check(domain);

    let updated: DomainCandidate | null = null;
    if (existing) {
      const trademark = trademarkService.assess(domain, [
        existing.narrative?.title ?? "",
        ...jsonArray(existing.narrative?.terms)
      ]);
      const contextTerms = [existing.narrative?.title ?? "", ...jsonArray(existing.narrative?.terms)];
      const socialHandles = await socialHandleService.check(existing.root);
      const marketSignals = await domainMarketService.findSignals(existing.root, existing.tld, contextTerms);
      const scored = domainMarketService.applyToScore(
        domainScoringService.score(existing, existing.narrative, availability, trademark),
        marketSignals
      );
      updated = await this.updateCandidate(existing.id, availability, scored, trademark.risk, socialHandles);
    }

    await prisma.availabilityCheck.create({
      data: {
        domainId: updated?.id ?? existing?.id,
        domain,
        status: availability.status,
        confidence: availability.confidence,
        method: availability.method,
        raw: availability.raw as never
      }
    });

    return { candidate: updated, availability };
  }

  async bulkCheck(domainOrIds: string[]) {
    return mapLimit(domainOrIds, 5, async (domainOrId) => {
      const result = await this.checkAndUpdate(domainOrId);
      return {
        domain: result.availability.domain,
        availability: result.availability,
        candidate: result.candidate
      };
    });
  }

  async rescoreCandidate(candidate: DomainCandidate, narrative: Narrative | null = null) {
    const availability: AvailabilityResult = {
      domain: candidate.domain,
      status: candidate.availableStatus as AvailabilityResult["status"],
      confidence: candidate.availabilityConfidence as AvailabilityResult["confidence"],
      method: "none"
    };
    const trademark = trademarkService.assess(candidate.domain, [
      narrative?.title ?? "",
      ...jsonArray(narrative?.terms)
    ]);
    const scored = domainScoringService.score(candidate, narrative, availability, trademark);
    return this.updateCandidate(candidate.id, availability, scored, trademark.risk);
  }

  toBuyPayload(candidate: DomainCandidate & { narrative?: Narrative | null }) {
    return {
      domain: candidate.domain,
      decision: candidate.decision,
      score: candidate.score,
      category: candidate.category,
      narrative: candidate.narrative?.title ?? null,
      resalePotential: candidate.resalePotential,
      estimatedResaleRangeUsd: candidate.estimatedResaleRangeUsd,
      maxRecommendedBuyPriceUsd: candidate.maxRecommendedBuyPriceUsd,
      reasoning: candidate.reasoning,
      risks: jsonArray(candidate.risks),
      sourceSignals: jsonArray(candidate.sourceSignals)
    };
  }

  private async upsertIdea(
    idea: GeneratedDomainIdea,
    narrative: Narrative,
    checkAvailability: boolean
  ): Promise<DomainCandidate> {
    const contextTerms = [narrative.title, ...jsonArray(narrative.terms)];
    const trademark = trademarkService.assess(idea.domain, contextTerms);
    const availability = checkAvailability ? await availabilityService.check(idea.domain) : unknownAvailability(idea.domain);
    const socialHandles = checkAvailability ? await socialHandleService.check(idea.root) : [];
    const marketSignals = await domainMarketService.findSignals(idea.root, idea.tld, contextTerms);
    const scored = domainMarketService.applyToScore(
      domainScoringService.score(idea, narrative, availability, trademark),
      marketSignals
    );

    const candidate = await prisma.domainCandidate.upsert({
      where: { domain: idea.domain },
      create: {
        narrativeId: narrative.id,
        domain: idea.domain,
        root: idea.root,
        tld: idea.tld,
        category: narrative.category,
        generationType: idea.generationType,
        decision: scored.decision,
        score: scored.score,
        availableStatus: availability.status,
        availabilityConfidence: availability.confidence,
        trademarkRisk: trademark.risk,
        resalePotential: scored.resalePotential,
        estimatedResaleRangeUsd: scored.estimatedResaleRangeUsd,
        maxRecommendedBuyPriceUsd: scored.maxRecommendedBuyPriceUsd,
        reasoning: scored.reasoning,
        risks: scored.risks as never,
        sourceSignals: narrative.sourceSignals as never,
        metadata: {
          generationReasoning: idea.reasoning,
          socialHandles,
          marketSignals,
          factors: scored.factors
        } as never
      },
      update: {
        narrativeId: narrative.id,
        category: narrative.category,
        generationType: idea.generationType,
        decision: scored.decision,
        score: scored.score,
        availableStatus: availability.status,
        availabilityConfidence: availability.confidence,
        trademarkRisk: trademark.risk,
        resalePotential: scored.resalePotential,
        estimatedResaleRangeUsd: scored.estimatedResaleRangeUsd,
        maxRecommendedBuyPriceUsd: scored.maxRecommendedBuyPriceUsd,
        reasoning: scored.reasoning,
        risks: scored.risks as never,
        sourceSignals: narrative.sourceSignals as never,
        metadata: {
          generationReasoning: idea.reasoning,
          socialHandles,
          marketSignals,
          factors: scored.factors
        } as never
      }
    });

    if (checkAvailability) {
      await prisma.availabilityCheck.create({
        data: {
          domainId: candidate.id,
          domain: idea.domain,
          status: availability.status,
          confidence: availability.confidence,
          method: availability.method,
          raw: availability.raw as never
        }
      });
    }

    return candidate;
  }

  private async updateCandidate(
    id: string,
    availability: AvailabilityResult,
    scored: DomainScoreResult,
    trademarkRisk: string,
    socialHandles: unknown[] = []
  ) {
    return prisma.domainCandidate.update({
      where: { id },
      data: {
        decision: scored.decision,
        score: scored.score,
        availableStatus: availability.status,
        availabilityConfidence: availability.confidence,
        trademarkRisk,
        resalePotential: scored.resalePotential,
        estimatedResaleRangeUsd: scored.estimatedResaleRangeUsd,
        maxRecommendedBuyPriceUsd: scored.maxRecommendedBuyPriceUsd,
        reasoning: scored.reasoning,
        risks: scored.risks as never,
        metadata: {
          socialHandles,
          factors: scored.factors
        } as never
      }
    });
  }
}

export const domainService = new DomainService();
