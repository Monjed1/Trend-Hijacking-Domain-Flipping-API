import { resolve4, resolveNs } from "node:dns/promises";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { AvailabilityResult } from "../types";

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  const timeout = new Promise<never>((_resolve, reject) => {
    const handle = setTimeout(() => {
      clearTimeout(handle);
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]);
};

export class AvailabilityService {
  async check(domain: string): Promise<AvailabilityResult> {
    const normalized = domain.toLowerCase().trim();
    const rdap = await this.checkRdap(normalized);
    if (rdap.status !== "unknown") return rdap;

    const whois = await this.checkWhois(normalized);
    if (whois.status !== "unknown") return whois;

    const registrar = await this.checkRegistrarApi(normalized);
    if (registrar.status !== "unknown") return registrar;

    return this.checkDns(normalized);
  }

  private async checkRdap(domain: string): Promise<AvailabilityResult> {
    try {
      const response = await withTimeout(fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`), env.REQUEST_TIMEOUT_MS);

      if (response.status === 404) {
        return {
          domain,
          status: "available",
          confidence: "high",
          method: "rdap",
          raw: { statusCode: response.status }
        };
      }

      if (response.ok) {
        const payload = (await response.json()) as Record<string, unknown>;
        return {
          domain,
          status: "registered",
          confidence: "high",
          method: "rdap",
          raw: {
            ldhName: payload.ldhName,
            status: payload.status,
            events: payload.events
          }
        };
      }

      return {
        domain,
        status: "unknown",
        confidence: "low",
        method: "rdap",
        raw: { statusCode: response.status }
      };
    } catch (error) {
      logger.debug({ error, domain }, "RDAP availability check failed");
      return {
        domain,
        status: "unknown",
        confidence: "low",
        method: "rdap",
        raw: { error: error instanceof Error ? error.message : "rdap failed" }
      };
    }
  }

  private async checkWhois(domain: string): Promise<AvailabilityResult> {
    try {
      const { default: whois } = await import("whois-json");
      const payload = await withTimeout(whois(domain), env.REQUEST_TIMEOUT_MS);
      const text = JSON.stringify(payload).toLowerCase();

      if (text.includes("no match") || text.includes("not found") || text.includes("available")) {
        return {
          domain,
          status: "available",
          confidence: "medium",
          method: "whois",
          raw: payload
        };
      }

      if (payload && Object.keys(payload).length > 0) {
        return {
          domain,
          status: "registered",
          confidence: "medium",
          method: "whois",
          raw: payload
        };
      }
    } catch (error) {
      logger.debug({ error, domain }, "WHOIS availability fallback failed");
    }

    return {
      domain,
      status: "unknown",
      confidence: "low",
      method: "whois"
    };
  }

  private async checkRegistrarApi(domain: string): Promise<AvailabilityResult> {
    // TODO: Wire a registrar-specific API here, such as Namecheap, GoDaddy, Cloudflare Registrar, or Dynadot.
    // Keep it behind env credentials and normalize provider-specific responses into AvailabilityResult.
    return {
      domain,
      status: "unknown",
      confidence: "low",
      method: "registrar",
      raw: { note: "Registrar API checker is not configured." }
    };
  }

  private async checkDns(domain: string): Promise<AvailabilityResult> {
    try {
      const [nameservers, records] = await Promise.allSettled([resolveNs(domain), resolve4(domain)]);
      const hasDns =
        (nameservers.status === "fulfilled" && nameservers.value.length > 0) ||
        (records.status === "fulfilled" && records.value.length > 0);

      if (hasDns) {
        return {
          domain,
          status: "registered",
          confidence: "low",
          method: "dns",
          raw: {
            nameservers: nameservers.status === "fulfilled" ? nameservers.value : [],
            records: records.status === "fulfilled" ? records.value : []
          }
        };
      }

      return {
        domain,
        status: "available",
        confidence: "low",
        method: "dns",
        raw: { note: "No DNS records found. This is not proof of registration availability." }
      };
    } catch (error) {
      return {
        domain,
        status: "unknown",
        confidence: "low",
        method: "dns",
        raw: { error: error instanceof Error ? error.message : "dns failed" }
      };
    }
  }
}

export const availabilityService = new AvailabilityService();
