export const browserHeaders = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9"
};

export const absoluteUrl = (href: string | undefined, baseUrl: string) => {
  if (!href) return undefined;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
};

export const parseCompactNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, "").trim().toLowerCase();
  const match = normalized.match(/([\d.]+)\s*([km])?/);
  if (!match) return undefined;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return undefined;
  if (match[2] === "k") return Math.round(number * 1000);
  if (match[2] === "m") return Math.round(number * 1000000);
  return Math.round(number);
};

export const extractDomainTokens = (value: string) =>
  Array.from(
    new Set(
      value
        .toLowerCase()
        .match(/\b[a-z0-9][a-z0-9-]{1,62}\.(?:com|ai|io|co|app|it|so|gg|xyz|net|org|dev)\b/g) ?? []
    )
  );

export const extractHashtags = (value: string) =>
  Array.from(new Set(value.match(/#[a-zA-Z0-9_]{2,50}/g) ?? [])).map((tag) => tag.toLowerCase());

export const parseUsd = (value: string): number | undefined => {
  const match = value.match(/\$\s*([\d,]+)(?:\.\d{2})?/);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : undefined;
};
