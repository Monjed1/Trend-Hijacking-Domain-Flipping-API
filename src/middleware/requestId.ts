import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};
