import { z } from "zod";

export const trendSourceValues = [
  "producthunt",
  "techcrunch",
  "reddit",
  "hackernews",
  "github",
  "twitter",
  "googletrends",
  "googleautocomplete",
  "googleserp",
  "namebio",
  "huggingface",
  "npm",
  "pypi",
  "appstore",
  "tiktok"
] as const;

export const trendSourceSchema = z.enum(trendSourceValues);
