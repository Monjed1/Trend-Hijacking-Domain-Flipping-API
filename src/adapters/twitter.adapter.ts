import axios from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import type { TrendAdapter } from "./trendAdapter";

type TwitterSearchResponse = {
  data?: Array<{
    id: string;
    text: string;
    created_at?: string;
    author_id?: string;
  }>;
  meta?: Record<string, unknown>;
};

export class TwitterAdapter implements TrendAdapter {
  readonly source = "twitter" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    if (!env.ENABLE_TWITTER || !env.TWITTER_BEARER_TOKEN) {
      logger.debug("Twitter/X collection disabled or missing TWITTER_BEARER_TOKEN");
      return [];
    }

    try {
      const categories = options.categories?.length ? options.categories : ["AI", "startup", "SaaS", "crypto", "gaming"];
      const query = `(${categories.map((category) => `"${category}"`).join(" OR ")}) lang:en -is:retweet`;

      const response = await axios.get<TwitterSearchResponse>("https://api.twitter.com/2/tweets/search/recent", {
        timeout: env.REQUEST_TIMEOUT_MS,
        params: {
          query,
          max_results: Math.min(Math.max(options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE, 10), 100),
          "tweet.fields": "created_at,author_id,public_metrics"
        },
        headers: {
          authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}`
        }
      });

      return (
        response.data.data?.map((tweet) => ({
          source: this.source,
          sourceId: tweet.id,
          title: tweet.text.slice(0, 140),
          url: `https://twitter.com/i/web/status/${tweet.id}`,
          author: tweet.author_id,
          content: tweet.text,
          publishedAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
          metadata: {
            meta: response.data.meta
          }
        })) ?? []
      );
    } catch (error) {
      logger.warn({ error }, "Twitter/X API collection failed");
      return [];
    }
  }
}
