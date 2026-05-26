import Parser from "rss-parser";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import type { TrendAdapter } from "./trendAdapter";

export class TechCrunchAdapter implements TrendAdapter {
  readonly source = "techcrunch" as const;
  private readonly parser = new Parser();

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    try {
      const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
      const feed = await this.parser.parseURL("https://techcrunch.com/feed/");

      return feed.items.slice(0, limit).map((item) => ({
        source: this.source,
        sourceId: item.guid,
        title: item.title ?? "Untitled TechCrunch item",
        url: item.link,
        author: item.creator,
        content: item.contentSnippet ?? item.content,
        category: item.categories?.[0],
        publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
        metadata: {
          categories: item.categories ?? []
        }
      }));
    } catch (error) {
      logger.warn({ error }, "TechCrunch RSS collection failed");
      return [];
    }
  }
}
