import type { TrademarkRiskResult } from "../types";
import { slugWords } from "../utils/text";

const protectedBrands = [
  "openai",
  "chatgpt",
  "deepseek",
  "anthropic",
  "claude",
  "google",
  "gemini",
  "microsoft",
  "github",
  "apple",
  "amazon",
  "aws",
  "meta",
  "facebook",
  "instagram",
  "whatsapp",
  "tesla",
  "nvidia",
  "netflix",
  "disney",
  "youtube",
  "tiktok",
  "twitter",
  "xbox",
  "playstation",
  "nintendo",
  "pokemon",
  "minecraft",
  "fortnite",
  "roblox",
  "shopify",
  "stripe",
  "paypal",
  "salesforce",
  "slack",
  "notion",
  "figma",
  "canva",
  "airbnb",
  "uber",
  "lyft",
  "binance",
  "coinbase",
  "ethereum",
  "bitcoin"
];

const sensitiveSignals = [
  "movie",
  "game",
  "gaming",
  "celebrity",
  "official",
  "fan",
  "token",
  "coin",
  "bet",
  "casino"
];

const blockedNicheSignals = ["porn", "adult", "malware", "phishing", "scam", "weapon", "drugs"];

const levenshtein = (a: string, b: string) => {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const similarity = (a: string, b: string) => {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(a, b) / maxLength;
};

export class TrademarkService {
  assess(domain: string, contextTerms: string[] = []): TrademarkRiskResult {
    const root = domain.toLowerCase().split(".")[0] ?? "";
    const words = [...slugWords(root), ...contextTerms.flatMap(slugWords)];
    const reasons: string[] = [];
    const matchedTerms: string[] = [];

    for (const brand of protectedBrands) {
      if (root === brand || words.includes(brand)) {
        reasons.push(`Exact protected-brand match: ${brand}`);
        matchedTerms.push(brand);
      } else if (root.includes(brand) && brand.length > 3) {
        reasons.push(`Contains protected brand term: ${brand}`);
        matchedTerms.push(brand);
      } else if (root.length >= 5 && similarity(root, brand) >= 0.86) {
        reasons.push(`Fuzzy similarity to protected brand: ${brand}`);
        matchedTerms.push(brand);
      }
    }

    for (const signal of sensitiveSignals) {
      if (words.includes(signal)) {
        reasons.push(`Sensitive category signal: ${signal}`);
      }
    }

    for (const signal of blockedNicheSignals) {
      if (root.includes(signal) || words.includes(signal)) {
        reasons.push(`Blocked harmful/adult niche signal: ${signal}`);
        matchedTerms.push(signal);
      }
    }

    if (reasons.some((reason) => reason.startsWith("Exact") || reason.startsWith("Contains") || reason.startsWith("Blocked"))) {
      return { risk: "high", reasons, matchedTerms };
    }

    if (reasons.length > 0) {
      return { risk: "medium", reasons, matchedTerms };
    }

    return {
      risk: "low",
      reasons: ["No local blacklist or fuzzy brand collision detected. Manual trademark search still required."],
      matchedTerms
    };
  }
}

export const trademarkService = new TrademarkService();
