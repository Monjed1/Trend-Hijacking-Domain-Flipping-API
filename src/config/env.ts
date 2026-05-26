import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (value === "") return undefined;
    if (typeof value === "string") return value.toLowerCase() === "true";
    return value;
  }, z.boolean().default(defaultValue));

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const csv = (value: string | undefined, fallback: string[]) =>
  (value ?? fallback.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3030),
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default("postgresql://postgres:postgres@localhost:5432/trend_domains?schema=public")
  ),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().url().default("redis://localhost:6379")),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional().default("")),
  OPENAI_BASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().optional().default("https://api.openai.com/v1")
  ),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().optional().default("deepseek-chat")),
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["openai", "ollama"]).default("openai")),
  OLLAMA_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional().default("http://localhost:11434")),
  OLLAMA_MODEL: z.preprocess(emptyToUndefined, z.string().optional().default("llama3.1")),
  PRODUCT_HUNT_TOKEN: z.preprocess(emptyToUndefined, z.string().optional().default("")),
  REDDIT_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional().default("")),
  REDDIT_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional().default("")),
  TWITTER_BEARER_TOKEN: z.preprocess(emptyToUndefined, z.string().optional().default("")),
  ENABLE_PRODUCT_HUNT: booleanFromEnv(true),
  ENABLE_TECHCRUNCH: booleanFromEnv(true),
  ENABLE_REDDIT: booleanFromEnv(true),
  ENABLE_HACKERNEWS: booleanFromEnv(true),
  ENABLE_GITHUB_TRENDING: booleanFromEnv(true),
  ENABLE_TWITTER: booleanFromEnv(false),
  ENABLE_GOOGLE_TRENDS: booleanFromEnv(true),
  ENABLE_GOOGLE_AUTOCOMPLETE: booleanFromEnv(true),
  ENABLE_GOOGLE_SERP: booleanFromEnv(false),
  ENABLE_NAMEBIO: booleanFromEnv(true),
  ENABLE_HUGGINGFACE: booleanFromEnv(true),
  ENABLE_NPM: booleanFromEnv(true),
  ENABLE_PYPI: booleanFromEnv(true),
  ENABLE_APP_STORE: booleanFromEnv(true),
  ENABLE_TIKTOK_CREATIVE_CENTER: booleanFromEnv(true),
  ENABLE_SOCIAL_HANDLE_CHECK: booleanFromEnv(false),
  GOOGLE_TRENDS_GEO: z.preprocess(emptyToUndefined, z.string().optional().default("US")),
  APP_STORE_COUNTRY: z.preprocess(emptyToUndefined, z.string().optional().default("us")),
  DEFAULT_SUBREDDITS: z.preprocess(emptyToUndefined, z.string().optional()),
  MAX_DOMAINS_PER_NARRATIVE: z.coerce.number().int().positive().default(25),
  MIN_BUY_SCORE: z.coerce.number().int().min(0).max(100).default(80),
  MIN_WATCH_SCORE: z.coerce.number().int().min(0).max(100).default(65),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  COLLECT_LIMIT_PER_SOURCE: z.coerce.number().int().positive().default(30)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  DEFAULT_SUBREDDITS: csv(parsed.data.DEFAULT_SUBREDDITS, [
    "artificial",
    "startups",
    "SaaS",
    "entrepreneur",
    "technology",
    "LocalLLaMA",
    "gamedev",
    "gaming",
    "crypto",
    "webdev",
    "SideProject"
  ])
};
