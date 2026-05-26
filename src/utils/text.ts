export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const slugWords = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

export const domainRoot = (value: string) =>
  slugWords(value)
    .filter((part) => part.length > 1)
    .join("")
    .slice(0, 32);

export const uniqueBy = <T>(items: T[], keyFn: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const safeJsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const stripMarkdownJson = (value: string) =>
  value
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

export const tokenFrequency = (texts: string[], max = 30) => {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "your",
    "you",
    "are",
    "into",
    "over",
    "about",
    "after",
    "before",
    "using",
    "use",
    "new",
    "how",
    "why",
    "what",
    "when",
    "have",
    "has",
    "will",
    "can",
    "more",
    "best",
    "launch",
    "show",
    "app",
    "apps"
  ]);

  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of slugWords(text)) {
      if (token.length < 3 || stopwords.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([term, count]) => ({ term, count }));
};

export const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
) => {
  const results: R[] = [];
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
};
