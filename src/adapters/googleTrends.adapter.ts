import axios from "axios";
import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import { browserHeaders } from "../utils/scrape";
import type { TrendAdapter } from "./trendAdapter";

export class GoogleTrendsAdapter implements TrendAdapter {
  readonly source = "googletrends" as const;
  private readonly parser = new Parser();

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
    const geo = env.GOOGLE_TRENDS_GEO;
    const rssUrls = [
      `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`,
      `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${encodeURIComponent(geo)}`
    ];

    for (const url of rssUrls) {
      const items = await this.collectFromRss(url, limit).catch((error) => {
        logger.debug({ error, url }, "Google Trends RSS attempt failed");
        return [];
      });
      if (items.length > 0) return items;
    }

    return this.collectFromTrendingPage(limit).catch((error) => {
      logger.warn({ error }, "Google Trends page scrape failed");
      return [];
    });
  }

  private async collectFromRss(url: string, limit: number): Promise<CollectedTrend[]> {
    const feed = await this.parser.parseURL(url);
    return feed.items.slice(0, limit).map((item, index) => ({
      source: this.source,
      sourceId: item.guid ?? item.link ?? `${url}:${index}`,
      title: item.title ?? "Untitled Google trend",
      url: item.link,
      content: item.contentSnippet ?? item.content,
      category: "search-demand",
      publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
      metadata: {
        feedTitle: feed.title,
        scrapeMethod: "google-trends-rss",
        geo: env.GOOGLE_TRENDS_GEO,
        rank: index + 1
      }
    }));
  }

  private async collectFromTrendingPage(limit: number): Promise<CollectedTrend[]> {
    const url = `https://trends.google.com/trending?geo=${encodeURIComponent(env.GOOGLE_TRENDS_GEO)}`;
    const response = await axios.get<string>(url, {
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: browserHeaders
    });

    const $ = cheerio.load(response.data);
    const trends: CollectedTrend[] = [];
    const seen = new Set<string>();

    $("a, div, span").each((_index, element) => {
      const text = $(element).text().replace(/\s+/g, " ").trim();
      if (text.length < 4 || text.length > 90) return;
      if (seen.has(text.toLowerCase())) return;
      if (!/[a-z]/i.test(text)) return;

      seen.add(text.toLowerCase());
      trends.push({
        source: this.source,
        sourceId: `google-trending-page:${text.toLowerCase()}`,
        title: text,
        url,
        category: "search-demand",
        publishedAt: new Date(),
        metadata: {
          scrapeMethod: "google-trends-page",
          geo: env.GOOGLE_TRENDS_GEO
        }
      });
    });

    return trends.slice(0, limit);
  }
}
