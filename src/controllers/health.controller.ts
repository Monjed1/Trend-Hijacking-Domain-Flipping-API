import type { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";
import { sendSuccess } from "../utils/apiResponse";

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = 1500) =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const handle = setTimeout(() => {
        clearTimeout(handle);
        reject(new Error("timeout"));
      }, timeoutMs);
    })
  ]);

export const healthController = {
  get: async (req: Request, res: Response) => {
    const [database, redis] = await Promise.allSettled([
      withTimeout(prisma.$queryRaw`SELECT 1`),
      withTimeout(redisConnection.ping())
    ]);

    sendSuccess(req, res, {
      status: database.status === "fulfilled" && redis.status === "fulfilled" ? "ok" : "degraded",
      service: "trend-hijack-domain-api",
      dependencies: {
        database: database.status === "fulfilled" ? "ok" : "error",
        redis: redis.status === "fulfilled" ? "ok" : "error"
      },
      timestamp: new Date().toISOString()
    });
  }
};
