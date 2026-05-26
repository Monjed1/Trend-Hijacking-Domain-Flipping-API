import axios from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import type { TrendAdapter } from "./trendAdapter";

type HackerNewsItem = {
  id: number;
  type?: string;
  by?: string;
  time?: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
};

export class HackerNewsAdapter implements TrendAdapter {
  readonly source = "hackernews" as const;
  private readonly baseUrl = "https://hacker-news.firebaseio.com/v0";

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    try {
      const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
      const idsResponse = await axios.get<number[]>(`${this.baseUrl}/topstories.json`, {
        timeout: env.REQUEST_TIMEOUT_MS
      });

      const ids = idsResponse.data.slice(0, limit);
      const items = await Promise.all(ids.map((id) => this.getItem(id)));

      return items
        .filter((item): item is HackerNewsItem => Boolean(item?.title))
        .map((item) => ({
          source: this.source,
          sourceId: String(item.id),
          title: item.title ?? "Untitled Hacker News item",
          url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
          author: item.by,
          content: item.text,
          publishedAt: item.time ? new Date(item.time * 1000) : undefined,
          metadata: {
            score: item.score,
            comments: item.descendants,
            type: item.type
          }
        }));
    } catch (error) {
      logger.warn({ error }, "Hacker News collection failed");
      return [];
    }
  }

  private async getItem(id: number): Promise<HackerNewsItem | null> {
    try {
      const response = await axios.get<HackerNewsItem>(`${this.baseUrl}/item/${id}.json`, {
        timeout: env.REQUEST_TIMEOUT_MS
      });
      return response.data;
    } catch (error) {
      logger.debug({ error, id }, "Hacker News item fetch failed");
      return null;
    }
  }
}
