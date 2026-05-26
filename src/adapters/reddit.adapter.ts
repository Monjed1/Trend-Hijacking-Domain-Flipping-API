import axios from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import type { TrendAdapter } from "./trendAdapter";

type RedditListing = {
  data?: {
    children?: Array<{
      data: {
        id: string;
        title: string;
        selftext?: string;
        url?: string;
        permalink?: string;
        author?: string;
        subreddit?: string;
        score?: number;
        num_comments?: number;
        created_utc?: number;
      };
    }>;
  };
};

export class RedditAdapter implements TrendAdapter {
  readonly source = "reddit" as const;

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    const subreddits = options.subreddits?.length ? options.subreddits : env.DEFAULT_SUBREDDITS;
    const perSubreddit = Math.max(3, Math.ceil((options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE) / subreddits.length));

    // TODO: Add OAuth token exchange using REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET if public JSON rate limits become too tight.
    const results = await Promise.all(
      subreddits.map((subreddit) => this.collectSubreddit(subreddit, perSubreddit))
    );

    return results.flat().slice(0, options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE);
  }

  private async collectSubreddit(subreddit: string, limit: number): Promise<CollectedTrend[]> {
    try {
      const response = await axios.get<RedditListing>(
        `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json`,
        {
          timeout: env.REQUEST_TIMEOUT_MS,
          params: { limit, raw_json: 1 },
          headers: {
            "user-agent": "trend-domain-api/1.0 by domain-investor"
          }
        }
      );

      return (
        response.data.data?.children?.map(({ data }) => ({
          source: this.source,
          sourceId: data.id,
          title: data.title,
          url: data.permalink ? `https://www.reddit.com${data.permalink}` : data.url,
          author: data.author,
          content: data.selftext,
          category: data.subreddit,
          publishedAt: data.created_utc ? new Date(data.created_utc * 1000) : undefined,
          metadata: {
            subreddit: data.subreddit,
            score: data.score,
            comments: data.num_comments,
            outboundUrl: data.url
          }
        })) ?? []
      );
    } catch (error) {
      logger.warn({ error, subreddit }, "Reddit subreddit collection failed");
      return [];
    }
  }
}
