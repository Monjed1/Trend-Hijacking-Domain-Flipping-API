import axios from "axios";
import * as cheerio from "cheerio";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import { browserHeaders, extractHashtags } from "../utils/scrape";
import { uniqueBy } from "../utils/text";
import type { TrendAdapter } from "./trendAdapter";

export class TikTokCreativeCenterAdapter implements TrendAdapter {
  readonly source = "tiktok" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const urls = [
      "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
      "https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en",
      "https://ads.tiktok.com/business/creativecenter/inspiration/popular/creator/pc/en"
    ];
    const results = await Promise.all(urls.map((url) => this.scrapePage(url)));
    return uniqueBy(results.flat(), (trend) => trend.title.toLowerCase()).slice(
      0,
      options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE
    );
  }

  private async scrapePage(url: string): Promise<CollectedTrend[]> {
    try {
      const response = await axios.get<string>(url, {
        timeout: env.REQUEST_TIMEOUT_MS,
        headers: browserHeaders
      });
      const $ = cheerio.load(response.data);
      const pageText = $("body").text().replace(/\s+/g, " ").trim();
      const scriptText = $("script")
        .map((_index, element) => $(element).text())
        .get()
        .join(" ");
      const hashtags = extractHashtags(`${pageText} ${scriptText}`);

      return hashtags.slice(0, 40).map((hashtag, index) => ({
        source: this.source,
        sourceId: `tiktok-creative-center:${hashtag}`,
        title: hashtag.replace(/^#/, ""),
        url,
        content: `TikTok Creative Center hashtag signal: ${hashtag}.`,
        category: "consumer-social-trend",
        publishedAt: new Date(),
        metadata: {
          hashtag,
          rank: index + 1,
          scrapeMethod: "tiktok-creative-center-html"
        }
      }));
    } catch (error) {
      logger.debug({ error, url }, "TikTok Creative Center scrape failed");
      return [];
    }
  }
}
