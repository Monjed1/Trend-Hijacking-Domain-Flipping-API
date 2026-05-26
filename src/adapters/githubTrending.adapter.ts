import axios from "axios";
import * as cheerio from "cheerio";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import type { TrendAdapter } from "./trendAdapter";

export class GithubTrendingAdapter implements TrendAdapter {
  readonly source = "github" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    try {
      const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
      const response = await axios.get<string>("https://github.com/trending?since=daily", {
        timeout: env.REQUEST_TIMEOUT_MS,
        headers: {
          "user-agent": "trend-domain-api/1.0",
          accept: "text/html"
        }
      });

      const $ = cheerio.load(response.data);
      const trends: CollectedTrend[] = [];

      $("article.Box-row").each((_index, element) => {
        const repoPath = $(element).find("h2 a").text().replace(/\s/g, "").trim();
        const description = $(element).find("p").first().text().trim();
        const language = $(element).find("[itemprop='programmingLanguage']").text().trim();
        const starsText = $(element).find("a[href$='/stargazers']").first().text().trim();
        const todayStarsText = $(element).find("span.d-inline-block.float-sm-right").text().trim();

        if (!repoPath) return;

        trends.push({
          source: this.source,
          sourceId: repoPath,
          title: repoPath.split("/").pop() ?? repoPath,
          url: `https://github.com/${repoPath}`,
          author: repoPath.split("/")[0],
          content: description,
          category: language || "developer-tools",
          publishedAt: new Date(),
          metadata: {
            repo: repoPath,
            language,
            starsText,
            todayStarsText
          }
        });
      });

      return trends.slice(0, limit);
    } catch (error) {
      logger.warn({ error }, "GitHub Trending collection failed");
      return [];
    }
  }
}
