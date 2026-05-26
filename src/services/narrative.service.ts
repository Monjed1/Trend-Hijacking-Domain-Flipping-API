import type { Narrative, RawTrend } from "@prisma/client";
import { aiClient } from "../ai/aiClient";
import { NARRATIVE_SCORING_SYSTEM_PROMPT, TREND_EXTRACTION_SYSTEM_PROMPT } from "../ai/prompts";
import { prisma } from "../config/prisma";
import type { ExtractedNarrative, NarrativeScores } from "../types";
import { clamp, tokenFrequency, uniqueBy } from "../utils/text";

type AiNarrativeExtractionResponse = {
  narratives?: ExtractedNarrative[];
};

type AiNarrativeScoreResponse = {
  scores?: NarrativeScores;
  overallScore?: number;
  reasoning?: string;
};

const toArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

const displaySource = (source: string) =>
  ({
    producthunt: "Product Hunt",
    techcrunch: "TechCrunch",
    reddit: "Reddit",
    hackernews: "Hacker News",
    github: "GitHub Trending",
    twitter: "X/Twitter",
    googletrends: "Google Trends",
    googleautocomplete: "Google Autocomplete",
    googleserp: "Google SERP",
    namebio: "NameBio",
    huggingface: "Hugging Face",
    npm: "npm",
    pypi: "PyPI",
    appstore: "Apple App Store",
    tiktok: "TikTok Creative Center"
  })[source] ?? source;

const avgScore = (scores: NarrativeScores) =>
  Math.round(
    Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.values(scores).length
  );

export class NarrativeService {
  async extractAndPersist(rawTrends: RawTrend[], maxNarratives = 10): Promise<Narrative[]> {
    if (rawTrends.length === 0) return [];

    const fallback = () => ({ narratives: this.extractDeterministic(rawTrends, maxNarratives) });
    const response = await aiClient.jsonCompletion<AiNarrativeExtractionResponse>(
      [
        { role: "system", content: TREND_EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            maxNarratives,
            trends: rawTrends.slice(0, 100).map((trend) => ({
              id: trend.id,
              source: trend.source,
              title: trend.title,
              category: trend.category,
              content: trend.content?.slice(0, 700),
              url: trend.url,
              metadata: trend.metadata
            }))
          })
        }
      ],
      fallback,
      { label: "trend-extraction", maxTokens: 4000 }
    );

    const normalized = uniqueBy(
      (response.narratives ?? fallback().narratives)
        .map((narrative) => this.normalizeNarrative(narrative, rawTrends))
        .filter((narrative): narrative is ExtractedNarrative => Boolean(narrative)),
      (narrative) => narrative.title.toLowerCase()
    ).slice(0, maxNarratives);

    const created: Narrative[] = [];
    for (const narrative of normalized) {
      created.push(
        await prisma.narrative.create({
          data: {
            title: narrative.title,
            category: narrative.category,
            summary: narrative.summary,
            commercialNarrative: narrative.commercialNarrative,
            terms: narrative.terms as never,
            buyerTypes: narrative.buyerTypes as never,
            sourceTrendIds: narrative.sourceTrendIds as never,
            sourceSignals: narrative.sourceSignals as never,
            scores: narrative.scores as never,
            overallScore: narrative.overallScore ?? (narrative.scores ? avgScore(narrative.scores) : 50)
          }
        })
      );
    }

    return created;
  }

  async scoreAndUpdate(narrative: Narrative): Promise<Narrative> {
    const fallbackScores = () => this.scoreDeterministic(narrative);
    const response = await aiClient.jsonCompletion<AiNarrativeScoreResponse>(
      [
        { role: "system", content: NARRATIVE_SCORING_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            narrative: {
              title: narrative.title,
              category: narrative.category,
              summary: narrative.summary,
              commercialNarrative: narrative.commercialNarrative,
              terms: narrative.terms,
              buyerTypes: narrative.buyerTypes,
              sourceSignals: narrative.sourceSignals
            }
          })
        }
      ],
      () => fallbackScores(),
      { label: "narrative-scoring", maxTokens: 1200 }
    );

    const scores = this.normalizeScores(response.scores ?? fallbackScores().scores);
    return prisma.narrative.update({
      where: { id: narrative.id },
      data: {
        scores: scores as never,
        overallScore: clamp(response.overallScore ?? avgScore(scores)),
        status: "SCORED"
      }
    });
  }

  private normalizeNarrative(narrative: ExtractedNarrative, rawTrends: RawTrend[]): ExtractedNarrative | null {
    if (!narrative.title || !narrative.summary || !narrative.commercialNarrative) return null;
    const sourceTrendIds = narrative.sourceTrendIds?.filter((id) => rawTrends.some((trend) => trend.id === id)) ?? [];
    const signals =
      narrative.sourceSignals?.length
        ? narrative.sourceSignals
        : uniqueBy(
            rawTrends
              .filter((trend) => sourceTrendIds.length === 0 || sourceTrendIds.includes(trend.id))
              .map((trend) => displaySource(trend.source)),
            (source) => source
          );

    const scores = narrative.scores ? this.normalizeScores(narrative.scores) : undefined;

    return {
      title: narrative.title.slice(0, 120),
      category: narrative.category?.slice(0, 80),
      summary: narrative.summary.slice(0, 500),
      commercialNarrative: narrative.commercialNarrative.slice(0, 1000),
      terms: uniqueBy(toArray(narrative.terms).slice(0, 20), (term) => term.toLowerCase()),
      buyerTypes: uniqueBy(toArray(narrative.buyerTypes).slice(0, 10), (term) => term.toLowerCase()),
      sourceTrendIds: sourceTrendIds.length ? sourceTrendIds : rawTrends.slice(0, 10).map((trend) => trend.id),
      sourceSignals: signals.slice(0, 10),
      emergingVocabulary: toArray(narrative.emergingVocabulary),
      startupNamingStyles: toArray(narrative.startupNamingStyles),
      emotionalWords: toArray(narrative.emotionalWords),
      newConcepts: toArray(narrative.newConcepts),
      scores,
      overallScore: clamp(narrative.overallScore ?? (scores ? avgScore(scores) : 50))
    };
  }

  private normalizeScores(scores: NarrativeScores): NarrativeScores {
    return {
      commercialIntent: Math.round(clamp(scores.commercialIntent ?? 50)),
      startupProbability: Math.round(clamp(scores.startupProbability ?? 50)),
      seoPotential: Math.round(clamp(scores.seoPotential ?? 50)),
      brandability: Math.round(clamp(scores.brandability ?? 50)),
      longevity: Math.round(clamp(scores.longevity ?? 50)),
      hypeVelocity: Math.round(clamp(scores.hypeVelocity ?? 50)),
      monetizationPotential: Math.round(clamp(scores.monetizationPotential ?? 50)),
      domainFlippingPotential: Math.round(clamp(scores.domainFlippingPotential ?? 50))
    };
  }

  private extractDeterministic(rawTrends: RawTrend[], maxNarratives: number): ExtractedNarrative[] {
    const texts = rawTrends.map((trend) => `${trend.title} ${trend.content ?? ""}`);
    const topTerms = tokenFrequency(texts, 40).map(({ term }) => term);
    const seeds = topTerms.slice(0, Math.max(maxNarratives * 2, 8));

    const narratives: ExtractedNarrative[] = [];
    for (const seed of seeds) {
      const related = rawTrends.filter((trend) => `${trend.title} ${trend.content ?? ""}`.toLowerCase().includes(seed));
      if (related.length === 0) continue;

      const relatedTexts = related.map((trend) => `${trend.title} ${trend.content ?? ""}`);
      const terms = uniqueBy([seed, ...tokenFrequency(relatedTexts, 12).map(({ term }) => term)], (term) => term).slice(0, 12);
      const sourceSignals = uniqueBy(related.map((trend) => displaySource(trend.source)), (source) => source);
      const category = this.inferCategory(terms, related);
      const buyerTypes = this.inferBuyerTypes(category, terms);
      const scores = this.scoreFromSignals(terms, related.length, sourceSignals.length, buyerTypes.length);

      narratives.push({
        title: `${this.titleCase(seed)} ${this.categoryLabel(category)}`,
        category,
        summary: `Repeated ${seed} signals across ${sourceSignals.join(", ")} suggest an emerging ${category} naming pocket.`,
        commercialNarrative: `${seed} is appearing in builder and startup contexts, creating possible demand for short brandable and exact-match domains aimed at ${buyerTypes.join(", ")}.`,
        terms,
        emergingVocabulary: terms.slice(0, 8),
        startupNamingStyles: ["short exact-match", "AI/SaaS suffix", "action verb + keyword", "pronounceable brandable"],
        emotionalWords: ["faster", "simple", "automated", "personalized"],
        newConcepts: terms.slice(0, 5).map((term) => `${term} workflow`),
        buyerTypes,
        sourceTrendIds: related.slice(0, 12).map((trend) => trend.id),
        sourceSignals,
        scores,
        overallScore: avgScore(scores)
      });
    }

    return uniqueBy(narratives, (narrative) => narrative.title.toLowerCase()).slice(0, maxNarratives);
  }

  private scoreDeterministic(narrative: Narrative): AiNarrativeScoreResponse {
    const terms = toArray(narrative.terms);
    const buyers = toArray(narrative.buyerTypes);
    const signals = toArray(narrative.sourceSignals);
    const scores = this.scoreFromSignals(terms, terms.length + buyers.length, signals.length, buyers.length);
    return {
      scores,
      overallScore: avgScore(scores),
      reasoning: "Deterministic score based on source breadth, commercial vocabulary, buyer-pool clarity, and naming potential."
    };
  }

  private scoreFromSignals(terms: string[], relatedCount: number, sourceCount: number, buyerCount: number): NarrativeScores {
    const commercialWords = ["ai", "agent", "automation", "saas", "security", "data", "workflow", "sales", "crm", "analytics", "crypto", "game", "dev"];
    const hasCommercial = terms.some((term) => commercialWords.includes(term));
    const base = 45 + Math.min(20, relatedCount * 2) + Math.min(15, sourceCount * 5) + Math.min(10, buyerCount * 3);
    return {
      commercialIntent: Math.round(clamp(base + (hasCommercial ? 12 : 0))),
      startupProbability: Math.round(clamp(base + (terms.includes("ai") || terms.includes("agent") ? 10 : 0))),
      seoPotential: Math.round(clamp(base + Math.min(12, terms.length))),
      brandability: Math.round(clamp(base + 5)),
      longevity: Math.round(clamp(base - 2)),
      hypeVelocity: Math.round(clamp(base + Math.min(15, sourceCount * 4))),
      monetizationPotential: Math.round(clamp(base + (buyerCount >= 3 ? 10 : 0))),
      domainFlippingPotential: Math.round(clamp(base + (hasCommercial ? 10 : 0)))
    };
  }

  private inferCategory(terms: string[], related: RawTrend[]) {
    const text = `${terms.join(" ")} ${related.map((trend) => trend.category ?? "").join(" ")}`.toLowerCase();
    if (/(ai|agent|llm|prompt|model)/.test(text)) return "AI agents";
    if (/(saas|startup|crm|sales|workflow)/.test(text)) return "SaaS";
    if (/(game|gaming|gamedev|steam)/.test(text)) return "gaming";
    if (/(crypto|wallet|token|defi|chain)/.test(text)) return "crypto";
    if (/(dev|github|code|api|database|cloud)/.test(text)) return "devtools";
    return "other";
  }

  private inferBuyerTypes(category: string, terms: string[]) {
    const common = ["startup founders", "micro-SaaS builders", "agencies"];
    if (category === "AI agents") return ["AI agent startups", "automation agencies", "SaaS founders", ...common];
    if (category === "gaming") return ["indie game studios", "gaming communities", "creator tool builders"];
    if (category === "crypto") return ["wallet startups", "analytics platforms", "Web3 agencies"];
    if (category === "devtools") return ["developer tool startups", "API companies", "open-source maintainers"];
    if (terms.some((term) => ["local", "city", "clinic", "restaurant"].includes(term))) return ["local service operators", "marketplace startups", "lead generation agencies"];
    return common;
  }

  private categoryLabel(category: string) {
    if (category === "other") return "commercial narrative";
    return category;
  }

  private titleCase(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

export const narrativeService = new NarrativeService();
