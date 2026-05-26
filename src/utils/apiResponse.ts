import type { Request, Response } from "express";

export const getRequestId = (req: Request): string =>
  (req as Request & { requestId?: string }).requestId ?? "unknown";

export const sendSuccess = (
  req: Request,
  res: Response,
  payload: Record<string, unknown> = {},
  statusCode = 200
) => {
  res.status(statusCode).json({
    success: true,
    requestId: getRequestId(req),
    ...payload
  });
};
