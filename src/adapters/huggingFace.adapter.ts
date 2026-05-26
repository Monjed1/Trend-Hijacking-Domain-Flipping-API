import axios from "axios";
import * as cheerio from "cheerio";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import { absoluteUrl, browserHeaders, parseCompactNumber } from "../utils/scrape";
import { uniqueBy } from "../utils/text";
import type { TrendAdapter } from "./trendAdapter";

export class HuggingFaceAdapter implements TrendAdapter {
  readonly source = "huggingface" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
    const pages = [
      { url: "https://huggingface.co/models?sort=trending", kind: "model" },
      { url: "https://huggingface.co/datasets?sort=trending", kind: "dataset" },
      { url: "https://huggingface.co/spaces?sort=trending", kind: "space" }
    ];
    const results = await Promise.all(pages.map((page) => this.scrapePage(page.url, page.kind)));
    return uniqueBy(results.flat(), (trend) => trend.sourceId ?? trend.title.toLowerCase()).slice(0, limit);
  }

  private async scrapePage(url: string, kind: string): Promise<CollectedTrend[]> {
    try {
      const response = await axios.get<string>(url, {
        timeout: env.REQUEST_TIMEOUT_MS,
        headers: browserHeaders
      });
      const $ = cheerio.load(response.data);
      const trends: CollectedTrend[] = [];

      $("article, .overview-card-wrapper, a[href]").each((index, element) => {
        const link = $(element).is("a") ? $(element) : $(element).find("a[href]").first();
        const href = link.attr("href");
        const repo = href?.replace(/^\//, "").split("?")[0];
        if (!repo || !repo.includes("/") || repo.split("/").length !== 2) return;
        if (repo.includes("login") || repo.includes("settings")) return;

        const text = $(element).text().replace(/\s+/g, " ").trim();
        const title = repo.split("/")[1];
        const downloads = parseCompactNumber(text.match(/([\d,.]+[km]?)\s*downloads?/i)?.[1]);
        const likes = parseCompactNumber(text.match(/([\d,.]+[km]?)\s*likes?/i)?.[1]);

        trends.push({
          source: this.source,
          sourceId: `hf:${kind}:${repo}`,
          title,
          url: absoluteUrl(href, "https://huggingface.co"),
          author: repo.split("/")[0],
          content: text.slice(0, 1000),
          category: `ai-${kind}`,
          publishedAt: new Date(),
          metadata: {
            repo,
            kind,
            downloads,
            likes,
            rank: index + 1,
            scrapeMethod: "huggingface-trending-html"
          }
        });
      });

      return trends;
    } catch (error) {
      logger.debug({ error, url }, "Hugging Face trending scrape failed");
      return [];
    }
  }
}
