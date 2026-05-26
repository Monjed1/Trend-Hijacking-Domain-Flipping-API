import type { DomainCandidate, Narrative } from "@prisma/client";
import { env } from "../config/env";
import type {
  AvailabilityResult,
  DomainDecision,
  DomainScoreResult,
  GeneratedDomainIdea,
  TrademarkRiskResult
} from "../types";
import { clamp, slugWords } from "../utils/text";

const tldFit: Record<string, number> = {
  com: 100,
  ai: 92,
  io: 84,
  co: 78,
  app: 74,
  so: 70,
  gg: 68,
  it: 66,
  xyz: 52
};

const scoreByRisk = {
  low: 0,
  medium: 12,
  high: 35
};

const scoreByAvailability = {
  available: 0,
  unknown: 10,
  registered: 45
};

const vowelRegex = /[aeiou]/i;

type NarrativeScoresObject = {
  commercialIntent?: number;
  startupProbability?: number;
  seoPotential?: number;
  brandability?: number;
  longevity?: number;
  hypeVelocity?: number;
  monetizationPotential?: number;
  domainFlippingPotential?: number;
};

const getScores = (narrative: Narrative): NarrativeScoresObject => {
  if (narrative.scores && typeof narrative.scores === "object" && !Array.isArray(narrative.scores)) {
    return narrative.scores as NarrativeScoresObject;
  }
  return {};
};

export class DomainScoringService {
  score(
    idea: GeneratedDomainIdea | DomainCandidate,
    narrative: Narrative | null,
    availability: AvailabilityResult,
    trademark: TrademarkRiskResult
  ): DomainScoreResult {
    const domain = idea.domain.toLowerCase();
    const root = "root" in idea ? idea.root : domain.split(".")[0];
    const tld = "tld" in idea ? idea.tld : domain.split(".").pop() ?? "com";
    const words = slugWords(root);
    const scores = narrative ? getScores(narrative) : {};
    const narrativeStrength = narrative?.overallScore ?? average(Object.values(scores)) ?? 55;
    const commercialIntent = scores.commercialIntent ?? narrativeStrength;
    const buyerPool = this.buyerPoolScore(narrative);
    const brandability = this.brandabilityScore(root, words);
    const memorability = this.memorabilityScore(root);
    const pronunciation = this.pronunciationScore(root);
    const extensionFit = tldFit[tld] ?? 45;

    const weighted =
      narrativeStrength * 0.2 +
      commercialIntent * 0.15 +
      buyerPool * 0.15 +
      brandability * 0.15 +
      memorability * 0.1 +
      pronunciation * 0.1 +
      extensionFit * 0.1;

    const penalty = scoreByRisk[trademark.risk] + scoreByAvailability[availability.status];
    const score = Math.round(clamp(weighted - penalty));
    const decision = this.decision(score, availability, trademark);
    const resalePotential = score >= 82 ? "high" : score >= 68 ? "medium" : score >= 50 ? "low" : "unknown";
    const maxRecommendedBuyPriceUsd = this.maxBuyPrice(score, tld, availability.status);

    const risks = [
      ...trademark.reasons.filter((reason) => trademark.risk !== "low" || !reason.startsWith("No local")),
      ...(availability.status === "unknown" ? ["Availability is unknown; verify with registrar before buying."] : []),
      ...(availability.status === "registered" ? ["Domain appears registered. Treat as acquisition target only."] : []),
      ...(tld === "xyz" ? ["Lower trust TLD fit for many startup buyers."] : [])
    ];

    return {
      score,
      decision,
      resalePotential,
      estimatedResaleRangeUsd: this.resaleRange(score),
      maxRecommendedBuyPriceUsd,
      reasoning: this.reasoning(domain, decision, score, narrative, availability, trademark),
      risks,
      factors: {
        narrativeStrength,
        commercialIntent,
        buyerPool,
        brandability,
        memorability,
        pronunciation,
        tldFit: extensionFit,
        riskPenalty: scoreByRisk[trademark.risk],
        availabilityPenalty: scoreByAvailability[availability.status],
        availability: availability.status,
        trademarkRisk: trademark.risk
      }
    };
  }

  private buyerPoolScore(narrative: Narrative | null) {
    if (!narrative?.buyerTypes) return 55;
    const buyerTypes = Array.isArray(narrative.buyerTypes) ? narrative.buyerTypes : [];
    return clamp(50 + buyerTypes.length * 10, 50, 95);
  }

  private brandabilityScore(root: string, words: string[]) {
    let score = 70;
    if (root.length >= 5 && root.length <= 10) score += 15;
    if (root.length > 16) score -= 20;
    if (words.length > 3) score -= 15;
    if (/[^a-z]/.test(root)) score -= 20;
    if (/(.)\1{2,}/.test(root)) score -= 12;
    return clamp(score);
  }

  private memorabilityScore(root: string) {
    let score = 75;
    if (root.length <= 8) score += 12;
    if (root.length > 18) score -= 22;
    if (root.includes("the") || root.includes("best")) score -= 8;
    return clamp(score);
  }

  private pronunciationScore(root: string) {
    let score = 72;
    if (!vowelRegex.test(root)) score -= 35;
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(root)) score -= 22;
    if (/[aeiou]{4,}/i.test(root)) score -= 10;
    if (root.length >= 5 && root.length <= 12) score += 12;
    return clamp(score);
  }

  private decision(score: number, availability: AvailabilityResult, trademark: TrademarkRiskResult): DomainDecision {
    if (trademark.risk === "high") return "DROP";
    if (score >= env.MIN_BUY_SCORE && availability.status === "available") return "BUY";
    if (score >= env.MIN_WATCH_SCORE && availability.status !== "registered") return "WATCH";
    return "DROP";
  }

  private maxBuyPrice(score: number, tld: string, status: AvailabilityResult["status"]) {
    if (status !== "available") return 0;
    const base = tld === "com" ? 40 : tld === "ai" ? 80 : tld === "io" ? 50 : 25;
    if (score >= 90) return base * 3;
    if (score >= 80) return base * 2;
    if (score >= 70) return base;
    return Math.min(15, base);
  }

  private resaleRange(score: number) {
    if (score >= 90) return "$2500-$10000";
    if (score >= 82) return "$1000-$5000";
    if (score >= 72) return "$500-$2500";
    if (score >= 65) return "$100-$1000";
    return "$0-$250";
  }

  private reasoning(
    domain: string,
    decision: DomainDecision,
    score: number,
    narrative: Narrative | null,
    availability: AvailabilityResult,
    trademark: TrademarkRiskResult
  ) {
    const narrativeText = narrative?.title ? ` for ${narrative.title}` : "";
    return `${domain} scored ${score}/100${narrativeText}. Decision ${decision} based on commercial narrative strength, buyer pool, naming quality, TLD fit, availability (${availability.status}), and trademark risk (${trademark.risk}). Verify trademarks manually before buying.`;
  }
}

const average = (values: unknown[]) => {
  const nums = values.filter((value): value is number => typeof value === "number");
  if (!nums.length) return undefined;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
};

export const domainScoringService = new DomainScoringService();
