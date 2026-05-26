import axios from "axios";
import * as cheerio from "cheerio";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import { absoluteUrl, browserHeaders } from "../utils/scrape";
import { uniqueBy } from "../utils/text";
import type { TrendAdapter } from "./trendAdapter";

export class GoogleSerpAdapter implements TrendAdapter {
  readonly source = "googleserp" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const categories = options.categories?.length ? options.categories : ["AI tools", "startup software", "gaming app", "crypto tools"];
    const queries = uniqueBy(
      categories.flatMap((category) => [
        `best ${category} tools`,
        `${category} startup`,
        `${category} software`,
        `${category} app`
      ]),
      (query) => query.toLowerCase()
    ).slice(0, 12);

    const results = await Promise.all(queries.map((query) => this.scrapeQuery(query)));
    return uniqueBy(results.flat(), (trend) => `${trend.title}:${trend.url ?? ""}`).slice(
      0,
      options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE
    );
  }

  private async scrapeQuery(query: string): Promise<CollectedTrend[]> {
    try {
      const url = "https://www.google.com/search";
      const response = await axios.get<string>(url, {
        timeout: env.REQUEST_TIMEOUT_MS,
        params: {
          q: query,
          hl: "en",
          gl: env.GOOGLE_TRENDS_GEO,
          num: 10
        },
        headers: browserHeaders
      });

      const $ = cheerio.load(response.data);
      const trends: CollectedTrend[] = [];

      $("h3").each((index, element) => {
        const title = $(element).text().replace(/\s+/g, " ").trim();
        if (!title || title.length < 5) return;

        const linkElement = $(element).closest("a").length ? $(element).closest("a") : $(element).parents("a").first();
        const href = linkElement.attr("href");
        const resultUrl = absoluteUrl(href, "https://www.google.com");
        const container = $(element).closest("div");
        const snippet = container.text().replace(/\s+/g, " ").trim().slice(0, 700);

        trends.push({
          source: this.source,
          sourceId: `google-serp:${query}:${index}`,
          title,
          url: resultUrl,
          content: snippet || `Google SERP result for query "${query}".`,
          category: "serp-demand",
          publishedAt: new Date(),
          metadata: {
            query,
            rank: index + 1,
            scrapeMethod: "google-serp-html"
          }
        });
      });

      return trends;
    } catch (error) {
      logger.debug({ error, query }, "Google SERP scrape failed");
      return [];
    }
  }
}
