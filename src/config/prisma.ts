import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

export const prisma = new PrismaClient({
  log: [
    { level: "error", emit: "event" },
    { level: "warn", emit: "event" }
  ]
});

prisma.$on("error", (event) => logger.error(event, "Prisma error"));
prisma.$on("warn", (event) => logger.warn(event, "Prisma warning"));
