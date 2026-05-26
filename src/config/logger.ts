import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "OPENAI_API_KEY",
    "PRODUCT_HUNT_TOKEN",
    "TWITTER_BEARER_TOKEN"
  ],
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
      : undefined
});
