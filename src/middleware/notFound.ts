import type { Request, Response } from "express";
import { getRequestId } from "../utils/apiResponse";

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    requestId: getRequestId(req),
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.path}`
    }
  });
};
