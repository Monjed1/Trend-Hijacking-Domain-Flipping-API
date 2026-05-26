import type { RawTrend } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { GithubTrendingAdapter } from "../adapters/githubTrending.adapter";
import { GoogleAutocompleteAdapter } from "../adapters/googleAutocomplete.adapter";
import { GoogleSerpAdapter } from "../adapters/googleSerp.adapter";
import { GoogleTrendsAdapter } from "../adapters/googleTrends.adapter";
import { HackerNewsAdapter } from "../adapters/hackerNews.adapter";
import { HuggingFaceAdapter } from "../adapters/huggingFace.adapter";
import { AppStoreAdapter } from "../adapters/appStore.adapter";
import { NameBioAdapter } from "../adapters/nameBio.adapter";
import { NpmAdapter } from "../adapters/npm.adapter";
import { PyPiAdapter } from "../adapters/pypi.adapter";
import { ProductHuntAdapter } from "../adapters/productHunt.adapter";
import { RedditAdapter } from "../adapters/reddit.adapter";
import { TikTokCreativeCenterAdapter } from "../adapters/tiktokCreativeCenter.adapter";
import { TechCrunchAdapter } from "../adapters/techCrunch.adapter";
import { TwitterAdapter } from "../adapters/twitter.adapter";
import type { TrendAdapter } from "../adapters/trendAdapter";
import type { CollectOptions, CollectedTrend, TrendSource } from "../types";
import { normalizeWhitespace, uniqueBy } from "../utils/text";

const sourceDisplayNames: Record<TrendSource, string> = {
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
};

export class TrendCollectionService {
  private readonly adapters: Record<TrendSource, TrendAdapter> = {
    producthunt: new ProductHuntAdapter(),
    techcrunch: new TechCrunchAdapter(),
    reddit: new RedditAdapter(),
    hackernews: new HackerNewsAdapter(),
    github: new GithubTrendingAdapter(),
    twitter: new TwitterAdapter(),
    googletrends: new GoogleTrendsAdapter(),
    googleautocomplete: new GoogleAutocompleteAdapter(),
    googleserp: new GoogleSerpAdapter(),
    namebio: new NameBioAdapter(),
    huggingface: new HuggingFaceAdapter(),
    npm: new NpmAdapter(),
    pypi: new PyPiAdapter(),
    appstore: new AppStoreAdapter(),
    tiktok: new TikTokCreativeCenterAdapter()
  };

  async collectAndPersist(options: CollectOptions): Promise<RawTrend[]> {
    const sources = this.enabledSources(options.sources);
    const collections = await Promise.all(
      sources.map(async (source) => {
        const adapter = this.adapters[source];
        const startedAt = Date.now();
        const trends = await adapter.collect({
          ...options,
          limitPerSource: options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE
        });
        logger.info({ source, count: trends.length, ms: Date.now() - startedAt }, "Trend source collected");
        return trends;
      })
    );

    const filtered = uniqueBy(
      collections
        .flat()
        .filter((trend) => this.matchesCategories(trend, options.categories))
        .map((trend) => ({
          ...trend,
          title: normalizeWhitespace(trend.title).slice(0, 300),
          content: trend.content ? normalizeWhitespace(trend.content).slice(0, 5000) : undefined
        })),
      (trend) => `${trend.source}:${trend.sourceId ?? trend.url ?? trend.title.toLowerCase()}`
    );

    const created: RawTrend[] = [];
    for (const trend of filtered) {
      created.push(
        await prisma.rawTrend.create({
          data: {
            source: trend.source,
            sourceId: trend.sourceId,
            title: trend.title,
            url: trend.url,
            author: trend.author,
            content: trend.content,
            category: trend.category,
            publishedAt: trend.publishedAt,
            metadata: {
              ...(trend.metadata ?? {}),
              sourceDisplayName: sourceDisplayNames[trend.source]
            } as never
          }
        })
      );
    }

    return created;
  }

  private enabledSources(requested?: TrendSource[]) {
    const enabled: Record<TrendSource, boolean> = {
      producthunt: env.ENABLE_PRODUCT_HUNT,
      techcrunch: env.ENABLE_TECHCRUNCH,
      reddit: env.ENABLE_REDDIT,
      hackernews: env.ENABLE_HACKERNEWS,
      github: env.ENABLE_GITHUB_TRENDING,
      twitter: env.ENABLE_TWITTER,
      googletrends: env.ENABLE_GOOGLE_TRENDS,
      googleautocomplete: env.ENABLE_GOOGLE_AUTOCOMPLETE,
      googleserp: env.ENABLE_GOOGLE_SERP,
      namebio: env.ENABLE_NAMEBIO,
      huggingface: env.ENABLE_HUGGINGFACE,
      npm: env.ENABLE_NPM,
      pypi: env.ENABLE_PYPI,
      appstore: env.ENABLE_APP_STORE,
      tiktok: env.ENABLE_TIKTOK_CREATIVE_CENTER
    };

    const sources = requested?.length
      ? requested
      : (Object.keys(this.adapters) as TrendSource[]).filter((source) => enabled[source]);

    return sources.filter((source) => enabled[source]);
  }

  private matchesCategories(trend: CollectedTrend, categories?: string[]) {
    if (!categories?.length) return true;
    const haystack = `${trend.title} ${trend.content ?? ""} ${trend.category ?? ""}`.toLowerCase();
    return categories.some((category) => haystack.includes(category.toLowerCase()));
  }
}

export const trendCollectionService = new TrendCollectionService();
