import axios from "axios";
import * as cheerio from "cheerio";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import { absoluteUrl, browserHeaders } from "../utils/scrape";
import type { TrendAdapter } from "./trendAdapter";

type AppleFeed = {
  feed?: {
    title?: string;
    results?: Array<{
      id?: string;
      name?: string;
      artistName?: string;
      url?: string;
      genres?: Array<{ name?: string }>;
      releaseDate?: string;
    }>;
  };
};

export class AppStoreAdapter implements TrendAdapter {
  readonly source = "appstore" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const feed = await this.collectFromAppleRss(options).catch((error) => {
      logger.debug({ error }, "Apple app RSS/feed scrape failed");
      return [];
    });
    if (feed.length > 0) return feed;

    return this.collectFromChartsPage(options).catch((error) => {
      logger.warn({ error }, "Apple App Store chart page scrape failed");
      return [];
    });
  }

  private async collectFromAppleRss(options: CollectOptions): Promise<CollectedTrend[]> {
    const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
    const url = `https://rss.applemarketingtools.com/api/v2/${env.APP_STORE_COUNTRY}/apps/top-free/${Math.min(
      100,
      limit
    )}/apps.json`;
    const response = await axios.get<AppleFeed>(url, {
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: {
        "user-agent": "trend-domain-api/1.0"
      }
    });

    return (response.data.feed?.results ?? []).slice(0, limit).map((app, index) => ({
      source: this.source,
      sourceId: `appstore:${app.id ?? app.name}`,
      title: app.name ?? "Untitled App Store app",
      url: app.url,
      author: app.artistName,
      content: `${app.name ?? "App"} by ${app.artistName ?? "unknown developer"} is ranking in Apple App Store top free apps.`,
      category: app.genres?.[0]?.name ?? "mobile-app",
      publishedAt: app.releaseDate ? new Date(app.releaseDate) : new Date(),
      metadata: {
        feedTitle: response.data.feed?.title,
        genres: app.genres?.map((genre) => genre.name).filter(Boolean) ?? [],
        rank: index + 1,
        country: env.APP_STORE_COUNTRY,
        scrapeMethod: "apple-rss-feed"
      }
    }));
  }

  private async collectFromChartsPage(options: CollectOptions): Promise<CollectedTrend[]> {
    const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
    const url = `https://apps.apple.com/${env.APP_STORE_COUNTRY}/charts/iphone`;
    const response = await axios.get<string>(url, {
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: browserHeaders
    });
    const $ = cheerio.load(response.data);
    const trends: CollectedTrend[] = [];

    $("a[href*='/app/']").each((index, element) => {
      const title = $(element).text().replace(/\s+/g, " ").trim();
      if (!title || title.length > 120) return;

      trends.push({
        source: this.source,
        sourceId: `appstore-page:${title}:${index}`,
        title,
        url: absoluteUrl($(element).attr("href"), "https://apps.apple.com"),
        content: `Apple App Store chart signal for ${title}.`,
        category: "mobile-app",
        publishedAt: new Date(),
        metadata: {
          rank: index + 1,
          country: env.APP_STORE_COUNTRY,
          scrapeMethod: "appstore-charts-html"
        }
      });
    });

    return trends.slice(0, limit);
  }
}
