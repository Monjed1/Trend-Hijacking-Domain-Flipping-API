import type { Narrative } from "@prisma/client";
import { aiClient } from "../ai/aiClient";
import { DOMAIN_GENERATION_SYSTEM_PROMPT } from "../ai/prompts";
import { env } from "../config/env";
import type { GeneratedDomainIdea } from "../types";
import { domainRoot, slugWords, uniqueBy } from "../utils/text";

type DomainGenerationResponse = {
  domains?: GeneratedDomainIdea[];
};

const tlds = ["com", "ai", "io", "co", "app", "it", "so", "gg", "xyz"];
const actionPrefixes = ["get", "try", "use", "build", "join"];
const saasSuffixes = ["ai", "labs", "flow", "hq", "stack"];
const localCities = ["miami", "austin", "dubai", "london", "nyc"];
const blockedTerms = ["porn", "adult", "malware", "phishing", "scam", "weapon", "drugs"];

const jsonArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

const cleanDomain = (domain: string) =>
  domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.]/g, "")
    .replace(/\.+/g, ".");

const validIdea = (idea: GeneratedDomainIdea) => {
  const cleaned = cleanDomain(idea.domain);
  if (!/^[a-z0-9]{2,32}\.[a-z]{2,10}$/.test(cleaned)) return false;
  if (cleaned.includes("-")) return false;
  if (/\d/.test(cleaned.replace(/\.ai$/, ""))) return false;
  if (blockedTerms.some((term) => cleaned.includes(term))) return false;
  return tlds.includes(cleaned.split(".").pop() ?? "");
};

export class DomainGeneratorService {
  async generateForNarrative(narrative: Narrative, maxDomains = env.MAX_DOMAINS_PER_NARRATIVE): Promise<GeneratedDomainIdea[]> {
    const fallback = () => this.generateDeterministic(narrative, maxDomains);
    const aiResponse = await aiClient.jsonCompletion<DomainGenerationResponse>(
      [
        { role: "system", content: DOMAIN_GENERATION_SYSTEM_PROMPT },
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
            },
            maxDomains
          })
        }
      ],
      () => ({ domains: fallback() }),
      { label: "domain-generation", maxTokens: 2200 }
    );

    const generated = [...(aiResponse.domains ?? []), ...fallback()];
    return uniqueBy(
      generated
        .map((idea) => this.normalizeIdea(idea))
        .filter((idea): idea is GeneratedDomainIdea => Boolean(idea) && validIdea(idea)),
      (idea) => idea.domain
    ).slice(0, maxDomains);
  }

  private normalizeIdea(idea: GeneratedDomainIdea): GeneratedDomainIdea | null {
    const domain = cleanDomain(idea.domain);
    const [root, tld] = domain.split(".");
    if (!root || !tld) return null;
    return {
      domain,
      root,
      tld,
      generationType: idea.generationType ?? "brandable",
      reasoning: idea.reasoning
    };
  }

  private generateDeterministic(narrative: Narrative, maxDomains: number): GeneratedDomainIdea[] {
    const terms = jsonArray(narrative.terms);
    const titleWords = slugWords(narrative.title);
    const categoryWords = slugWords(narrative.category ?? "");
    const baseTerms = uniqueBy([...terms.flatMap(slugWords), ...titleWords, ...categoryWords], (item) => item)
      .filter((term) => term.length >= 3 && term.length <= 14)
      .slice(0, 8);

    const compoundRoots = uniqueBy(
      [
        domainRoot(narrative.title),
        ...baseTerms,
        ...baseTerms.slice(0, 4).flatMap((term) => ["ai", "agent", "flow", "stack"].map((suffix) => `${term}${suffix}`))
      ].filter((root) => root.length >= 3 && root.length <= 24),
      (root) => root
    ).slice(0, 12);

    const ideas: GeneratedDomainIdea[] = [];

    for (const root of compoundRoots.slice(0, 5)) {
      for (const tld of ["com", "ai", "io"]) {
        ideas.push({
          domain: `${root}.${tld}`,
          root,
          tld,
          generationType: "exact-match",
          reasoning: "Compact exact or category-match variant with common startup TLD fit."
        });
      }
    }

    for (const root of baseTerms.slice(0, 4)) {
      for (const prefix of actionPrefixes) {
        ideas.push({
          domain: `${prefix}${root}.com`,
          root: `${prefix}${root}`,
          tld: "com",
          generationType: "action",
          reasoning: "Action-oriented .com suitable for SaaS onboarding or creator tools."
        });
      }

      for (const suffix of saasSuffixes) {
        const saasRoot = `${root}${suffix}`;
        ideas.push({
          domain: `${saasRoot}.com`,
          root: saasRoot,
          tld: "com",
          generationType: "ai-saas",
          reasoning: "AI/SaaS suffix pattern with a recognizable commercial keyword."
        });
      }
    }

    for (const root of baseTerms.slice(0, 5)) {
      if (["ship", "send", "build", "prompt", "flow"].includes(root)) {
        const hackTld = root === "flow" ? "so" : "it";
        ideas.push({
          domain: `${root}.${hackTld}`,
          root,
          tld: hackTld,
          generationType: "domain-hack",
          reasoning: "Natural domain hack where the TLD completes a familiar phrase."
        });
      }
    }

    const localValue = ["local", "retail", "real", "estate", "clinic", "fitness", "restaurant", "city"].some((term) =>
      baseTerms.includes(term)
    );
    if (localValue) {
      for (const root of baseTerms.slice(0, 3)) {
        for (const city of localCities.slice(0, 3)) {
          ideas.push({
            domain: `${city}${root}.com`,
            root: `${city}${root}`,
            tld: "com",
            generationType: "geo",
            reasoning: "Geo modifier only used because the narrative has local-service commercial value."
          });
        }
      }
    }

    for (const root of this.brandables(baseTerms).slice(0, 12)) {
      for (const tld of ["com", "ai", "io"]) {
        ideas.push({
          domain: `${root}.${tld}`,
          root,
          tld,
          generationType: "brandable",
          reasoning: "Short pronounceable startup-style brandable derived from narrative vocabulary."
        });
      }
    }

    return uniqueBy(ideas, (idea) => idea.domain).slice(0, maxDomains);
  }

  private brandables(terms: string[]) {
    const prefixes = terms.map((term) => term.slice(0, Math.min(4, term.length)));
    const suffixes = ["ly", "io", "za", "ra", "sy", "go", "up", "kit"];
    const blends: string[] = [];

    for (const prefix of prefixes) {
      for (const suffix of suffixes) {
        const candidate = `${prefix}${suffix}`;
        if (candidate.length >= 5 && candidate.length <= 10) blends.push(candidate);
      }
    }

    return uniqueBy(blends, (item) => item);
  }
}

export const domainGeneratorService = new DomainGeneratorService();
