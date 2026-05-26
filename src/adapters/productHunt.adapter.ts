import axios from "axios";
import Parser from "rss-parser";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { CollectOptions, CollectedTrend } from "../types";
import type { TrendAdapter } from "./trendAdapter";

type ProductHuntGraphQLResponse = {
  data?: {
    posts?: {
      edges?: Array<{
        node: {
          id: string;
          name: string;
          tagline?: string;
          url?: string;
          votesCount?: number;
          commentsCount?: number;
          createdAt?: string;
          topics?: { edges?: Array<{ node: { name: string } }> };
        };
      }>;
    };
  };
};

export class ProductHuntAdapter implements TrendAdapter {
  readonly source = "producthunt" as const;
  private readonly parser = new Parser();

  async collect(options: CollectOptions): Promise<CollectedTrend[]> {
    if (env.PRODUCT_HUNT_TOKEN) {
      const apiItems = await this.collectFromGraphQL(options).catch((error) => {
        logger.warn({ error }, "Product Hunt API collection failed; falling back to RSS");
        return [];
      });
      if (apiItems.length > 0) return apiItems;
    }

    return this.collectFromRss(options).catch((error) => {
      logger.warn({ error }, "Product Hunt RSS collection failed");
      return [];
    });
  }

  private async collectFromGraphQL(options: CollectOptions): Promise<CollectedTrend[]> {
    const limit = Math.min(options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE, 50);
    const query = `
      query Posts($limit: Int!) {
        posts(first: $limit, order: RANKING) {
          edges {
            node {
              id
              name
              tagline
              url
              votesCount
              commentsCount
              createdAt
              topics { edges { node { name } } }
            }
          }
        }
      }
    `;

    const response = await axios.post<ProductHuntGraphQLResponse>(
      "https://api.producthunt.com/v2/api/graphql",
      { query, variables: { limit } },
      {
        timeout: env.REQUEST_TIMEOUT_MS,
        headers: {
          authorization: `Bearer ${env.PRODUCT_HUNT_TOKEN}`,
          "content-type": "application/json"
        }
      }
    );

    return (
      response.data.data?.posts?.edges?.map(({ node }) => ({
        source: this.source,
        sourceId: node.id,
        title: node.name,
        url: node.url,
        content: node.tagline,
        category: node.topics?.edges?.[0]?.node.name,
        publishedAt: node.createdAt ? new Date(node.createdAt) : undefined,
        metadata: {
          votes: node.votesCount,
          comments: node.commentsCount,
          topics: node.topics?.edges?.map((edge) => edge.node.name) ?? []
        }
      })) ?? []
    );
  }

  private async collectFromRss(options: CollectOptions): Promise<CollectedTrend[]> {
    const limit = options.limitPerSource ?? env.COLLECT_LIMIT_PER_SOURCE;
    const feed = await this.parser.parseURL("https://www.producthunt.com/feed");

    return feed.items.slice(0, limit).map((item) => ({
      source: this.source,
      sourceId: item.guid,
      title: item.title ?? "Untitled Product Hunt item",
      url: item.link,
      content: item.contentSnippet ?? item.content,
      publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
      metadata: {
        feedTitle: feed.title
      }
    }));
  }
}
