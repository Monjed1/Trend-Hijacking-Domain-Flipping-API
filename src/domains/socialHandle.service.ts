import { env } from "../config/env";
import { logger } from "../config/logger";
import type { Confidence } from "../types";

type SocialHandleStatus = "available" | "taken" | "unknown" | "skipped";

export interface SocialHandleResult {
  platform: "github" | "twitter";
  handle: string;
  status: SocialHandleStatus;
  confidence: Confidence;
  url?: string;
  reason?: string;
}

const validHandle = (handle: string) => /^[a-zA-Z0-9][a-zA-Z0-9_]{2,20}$/.test(handle);

export class SocialHandleService {
  async check(root: string): Promise<SocialHandleResult[]> {
    const handle = root.toLowerCase();
    if (!env.ENABLE_SOCIAL_HANDLE_CHECK || !validHandle(handle)) {
      return [
        {
          platform: "github",
          handle,
          status: "skipped",
          confidence: "low",
          reason: "Social handle checks are disabled or handle format is invalid."
        }
      ];
    }

    const checks = [this.checkGithub(handle)];
    if (env.TWITTER_BEARER_TOKEN) checks.push(this.checkTwitter(handle));
    return Promise.all(checks);
  }

  private async checkGithub(handle: string): Promise<SocialHandleResult> {
    try {
      const response = await fetch(`https://api.github.com/users/${encodeURIComponent(handle)}`, {
        headers: {
          "user-agent": "trend-domain-api/1.0"
        }
      });

      if (response.status === 404) {
        return {
          platform: "github",
          handle,
          status: "available",
          confidence: "medium",
          url: `https://github.com/${handle}`
        };
      }

      if (response.ok) {
        return {
          platform: "github",
          handle,
          status: "taken",
          confidence: "high",
          url: `https://github.com/${handle}`
        };
      }

      return {
        platform: "github",
        handle,
        status: "unknown",
        confidence: "low",
        reason: `GitHub returned ${response.status}`
      };
    } catch (error) {
      logger.debug({ error, handle }, "GitHub handle check failed");
      return {
        platform: "github",
        handle,
        status: "unknown",
        confidence: "low",
        reason: "GitHub handle check failed"
      };
    }
  }

  private async checkTwitter(handle: string): Promise<SocialHandleResult> {
    try {
      const response = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}`, {
        headers: {
          authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}`
        }
      });

      if (response.status === 404) {
        return {
          platform: "twitter",
          handle,
          status: "available",
          confidence: "medium",
          url: `https://twitter.com/${handle}`
        };
      }

      if (response.ok) {
        return {
          platform: "twitter",
          handle,
          status: "taken",
          confidence: "high",
          url: `https://twitter.com/${handle}`
        };
      }

      return {
        platform: "twitter",
        handle,
        status: "unknown",
        confidence: "low",
        reason: `Twitter/X returned ${response.status}`
      };
    } catch (error) {
      logger.debug({ error, handle }, "Twitter/X handle check failed");
      return {
        platform: "twitter",
        handle,
        status: "unknown",
        confidence: "low",
        reason: "Twitter/X handle check failed"
      };
    }
  }
}

export const socialHandleService = new SocialHandleService();
