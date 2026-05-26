import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { getRequestId } from "../utils/apiResponse";
import { AppError } from "../utils/errors";

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = getRequestId(req);

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      requestId,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload.",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof AppError) {
    logger.warn({ error, requestId }, error.message);
    res.status(error.statusCode).json({
      success: false,
      requestId,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  logger.error({ error, requestId }, "Unhandled API error");
  res.status(500).json({
    success: false,
    requestId,
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected server error."
    }
  });
};
