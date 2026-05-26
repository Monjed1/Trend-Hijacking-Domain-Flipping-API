import { prisma } from "../config/prisma";
import type { DomainScoreResult } from "../types";
import { parseUsd } from "../utils/scrape";
import { clamp, slugWords, uniqueBy } from "../utils/text";

export interface DomainMarketSignals {
  compCount: number;
  tldCompCount: number;
  highestSaleUsd: number;
  medianSaleUsd: number;
  matchedDomains: string[];
}

const priceFromMetadata = (metadata: unknown): number | undefined => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const price = (metadata as { priceUsd?: unknown }).priceUsd;
  return typeof price === "number" && Number.isFinite(price) ? price : undefined;
};

export class DomainMarketService {
  async findSignals(root: string, tld: string, contextTerms: string[]): Promise<DomainMarketSignals> {
    const tokens = uniqueBy(
      [...slugWords(root), ...contextTerms.flatMap(slugWords)].filter((token) => token.length >= 4).slice(0, 10),
      (token) => token
    );

    if (tokens.length === 0) {
      return { compCount: 0, tldCompCount: 0, highestSaleUsd: 0, medianSaleUsd: 0, matchedDomains: [] };
    }

    const rows = await prisma.rawTrend.findMany({
      where: {
        source: "namebio",
        OR: tokens.flatMap((token) => [
          { title: { contains: token, mode: "insensitive" as const } },
          { content: { contains: token, mode: "insensitive" as const } }
        ])
      },
      orderBy: { collectedAt: "desc" },
      take: 30
    });

    const prices = rows
      .map((row) => priceFromMetadata(row.metadata) ?? parseUsd(`${row.title} ${row.content ?? ""}`))
      .filter((price): price is number => typeof price === "number");
    const matchedDomains = uniqueBy(
      rows
        .map((row) => {
          if (!row.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) return undefined;
          const domain = (row.metadata as { domain?: unknown }).domain;
          return typeof domain === "string" ? domain : undefined;
        })
        .filter((domain): domain is string => Boolean(domain)),
      (domain) => domain
    );
    const tldCompCount = matchedDomains.filter((domain) => domain.endsWith(`.${tld}`)).length;
    const sorted = prices.sort((a, b) => a - b);
    const medianSaleUsd = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    return {
      compCount: rows.length,
      tldCompCount,
      highestSaleUsd: sorted.at(-1) ?? 0,
      medianSaleUsd,
      matchedDomains: matchedDomains.slice(0, 10)
    };
  }

  applyToScore(scored: DomainScoreResult, signals: DomainMarketSignals): DomainScoreResult {
    if (signals.compCount === 0) return scored;

    const marketBoost = Math.min(
      8,
      2 + Math.min(3, signals.tldCompCount) + (signals.highestSaleUsd >= 2500 ? 3 : signals.highestSaleUsd >= 500 ? 2 : 1)
    );
    const score = Math.round(clamp(scored.score + marketBoost));

    return {
      ...scored,
      score,
      resalePotential: score >= 82 ? "high" : scored.resalePotential,
      estimatedResaleRangeUsd:
        signals.medianSaleUsd >= 2500
          ? "$2500-$10000"
          : signals.medianSaleUsd >= 1000
            ? "$1000-$5000"
            : scored.estimatedResaleRangeUsd,
      reasoning: `${scored.reasoning} Scraped NameBio market comps found ${signals.compCount} related sale signals, adding resale confidence.`,
      factors: {
        ...scored.factors,
        marketCompCount: signals.compCount,
        marketTldCompCount: signals.tldCompCount,
        marketHighestSaleUsd: signals.highestSaleUsd,
        marketMedianSaleUsd: signals.medianSaleUsd,
        marketBoost
      }
    };
  }
}

export const domainMarketService = new DomainMarketService();
