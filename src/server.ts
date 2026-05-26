import { createServer } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { redisConnection } from "./config/redis";

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Trend domain API listening");
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down API");
  server.close(async () => {
    await prisma.$disconnect();
    await redisConnection.quit();
    process.exit(0);
  });
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
