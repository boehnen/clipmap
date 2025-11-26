// backend/src/middleware/requestId.ts
import { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";

// Extend Express Request type to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  // Generate a unique request ID
  const id = randomBytes(8).toString("hex");
  req.requestId = id;
  
  // Add to response header for client correlation
  res.setHeader("X-Request-ID", id);
  
  next();
}

