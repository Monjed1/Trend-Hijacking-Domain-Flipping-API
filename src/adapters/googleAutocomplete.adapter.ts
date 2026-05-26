import axios from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import { uniqueBy } from "../utils/text";
import type { TrendAdapter } from "./trendAdapter";

const defaultSeeds = [
  "ai agent",
  "ai tool",
  "startup",
  "saas",
  "automation",
  "crypto",
  "gaming",
  "developer tool",
  "productivity app",
  "local service"
];

type SuggestResponse = [string, string[]];

export class GoogleAutocompleteAdapter implements TrendAdapter {
  readonly source = "googleautocomplete" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const seeds = this.buildSeeds(options);
    const perSeed = Math.max(2, Math.ceil((options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE) / seeds.length));
    const results = await Promise.all(seeds.map((seed) => this.collectSeed(seed, perSeed)));
    return uniqueBy(results.flat(), (trend) => trend.title.toLowerCase()).slice(
      0,
      options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE
    );
  }

  private buildSeeds(options: CollectOptions) {
    const categorySeeds = options.categories?.length ? options.categories : defaultSeeds;
    const modifiers = ["", " app", " software", " tool", " platform", " near me", " for business"];
    return uniqueBy(
      categorySeeds.flatMap((seed) => modifiers.map((modifier) => `${seed}${modifier}`.trim())),
      (seed) => seed.toLowerCase()
    ).slice(0, 40);
  }

  private async collectSeed(seed: string, limit: number): Promise<CollectedTrend[]> {
    try {
      const response = await axios.get<SuggestResponse>("https://suggestqueries.google.com/complete/search", {
        timeout: env.REQUEST_TIMEOUT_MS,
        params: {
          client: "firefox",
          hl: "en",
          gl: env.GOOGLE_TRENDS_GEO,
          q: seed
        },
        headers: {
          "user-agent": "trend-domain-api/1.0"
        }
      });

      return (response.data[1] ?? []).slice(0, limit).map((suggestion, index) => ({
        source: this.source,
        sourceId: `google-suggest:${seed}:${suggestion}`,
        title: suggestion,
        url: `https://www.google.com/search?q=${encodeURIComponent(suggestion)}`,
        content: `Google autocomplete suggestion for seed "${seed}". This is real search language useful for exact-match and SEO domain ideas.`,
        category: "search-language",
        publishedAt: new Date(),
        metadata: {
          seed,
          rank: index + 1,
          scrapeMethod: "google-autocomplete-public-suggest"
        }
      }));
    } catch (error) {
      logger.debug({ error, seed }, "Google autocomplete scrape failed");
      return [];
    }
  }
}
