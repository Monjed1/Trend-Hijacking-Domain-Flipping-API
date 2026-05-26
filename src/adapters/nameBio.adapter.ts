import axios from "axios";
import * as cheerio from "cheerio";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import { absoluteUrl, browserHeaders, extractDomainTokens, parseUsd } from "../utils/scrape";
import { uniqueBy } from "../utils/text";
import type { TrendAdapter } from "./trendAdapter";

export class NameBioAdapter implements TrendAdapter {
  readonly source = "namebio" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
    const reportUrls = await this.collectReportUrls();
    const reports = await Promise.all(reportUrls.slice(0, 4).map((url) => this.scrapeReport(url)));
    return uniqueBy(reports.flat(), (trend) => trend.sourceId ?? trend.title.toLowerCase()).slice(0, limit);
  }

  private async collectReportUrls() {
    try {
      const url = "https://namebio.com/blog/category/daily-market-report/";
      const response = await axios.get<string>(url, {
        timeout: env.REQUEST_TIMEOUT_MS,
        headers: browserHeaders
      });
      const $ = cheerio.load(response.data);
      const urls: string[] = [];

      $("a").each((_index, element) => {
        const text = $(element).text().toLowerCase();
        const href = absoluteUrl($(element).attr("href"), url);
        if (!href) return;
        if (text.includes("daily market report") || href.includes("daily-market-report")) urls.push(href);
      });

      return uniqueBy(urls, (item) => item).slice(0, 8);
    } catch (error) {
      logger.warn({ error }, "NameBio report index scrape failed");
      return ["https://namebio.com/blog/category/daily-market-report/"];
    }
  }

  private async scrapeReport(url: string): Promise<CollectedTrend[]> {
    try {
      const response = await axios.get<string>(url, {
        timeout: env.REQUEST_TIMEOUT_MS,
        headers: browserHeaders
      });
      const $ = cheerio.load(response.data);
      const trends: CollectedTrend[] = [];
      const pageTitle = $("title").text().trim();

      $("tr, p, li").each((index, element) => {
        const text = $(element).text().replace(/\s+/g, " ").trim();
        const domains = extractDomainTokens(text);
        if (!domains.length) return;

        const priceUsd = parseUsd(text);
        for (const domain of domains.slice(0, 5)) {
          const [root, tld] = domain.split(".");
          trends.push({
            source: this.source,
            sourceId: `namebio:${domain}:${priceUsd ?? "unknown"}:${index}`,
            title: `${domain}${priceUsd ? ` sold for $${priceUsd}` : " domain sale comp"}`,
            url,
            content: text.slice(0, 1000),
            category: "domain-sales-comps",
            publishedAt: new Date(),
            metadata: {
              domain,
              root,
              tld,
              priceUsd,
              reportTitle: pageTitle,
              scrapeMethod: "namebio-daily-market-report"
            }
          });
        }
      });

      return trends;
    } catch (error) {
      logger.debug({ error, url }, "NameBio report scrape failed");
      return [];
    }
  }
}
