// backend/src/middleware/securityHeaders.ts
import { Request, Response, NextFunction } from "express";
import { CONFIG } from "../config";

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Only add HSTS in production
  if (CONFIG.isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // Remove X-Powered-By header
  res.removeHeader("X-Powered-By");

  next();
}

