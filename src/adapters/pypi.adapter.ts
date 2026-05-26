import axios from "axios";
import * as cheerio from "cheerio";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import { absoluteUrl, browserHeaders } from "../utils/scrape";
import { uniqueBy } from "../utils/text";
import type { TrendAdapter } from "./trendAdapter";

export class PyPiAdapter implements TrendAdapter {
  readonly source = "pypi" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const seeds = (options.categories?.length ? options.categories : ["ai", "agent", "automation", "llm", "data", "crypto"]).slice(
      0,
      8
    );
    const results = await Promise.all(seeds.map((seed) => this.scrapeSearch(seed)));
    return uniqueBy(results.flat(), (trend) => trend.sourceId ?? trend.title.toLowerCase()).slice(
      0,
      options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE
    );
  }

  private async scrapeSearch(seed: string): Promise<CollectedTrend[]> {
    try {
      const url = `https://pypi.org/search/?q=${encodeURIComponent(seed)}&o=-created`;
      const response = await axios.get<string>(url, {
        timeout: env.REQUEST_TIMEOUT_MS,
        headers: browserHeaders
      });
      const $ = cheerio.load(response.data);
      const trends: CollectedTrend[] = [];

      $(".package-snippet, a[href^='/project/']").each((index, element) => {
        const href = $(element).attr("href") ?? $(element).find("a[href^='/project/']").first().attr("href");
        const packageName = href ? decodeURIComponent(href.replace("/project/", "").replace(/\//g, "").split("?")[0]) : undefined;
        if (!packageName || packageName.length > 120) return;

        const container = $(element);
        const text = container.text().replace(/\s+/g, " ").trim();

        trends.push({
          source: this.source,
          sourceId: `pypi:${packageName}`,
          title: packageName,
          url: absoluteUrl(href, "https://pypi.org"),
          content: text.slice(0, 1000),
          category: "python-package",
          publishedAt: new Date(),
          metadata: {
            seed,
            rank: index + 1,
            scrapeMethod: "pypi-search-html"
          }
        });
      });

      return trends;
    } catch (error) {
      logger.debug({ error, seed }, "PyPI search scrape failed");
      return [];
    }
  }
}
