import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const MIN_KEY_LENGTH = 32;

/**
 * These routes start SEP-24 ramps and can trigger a USDC payment, so they are
 * closed by default. CORS is not access control: it constrains browsers and
 * does nothing to a direct HTTP client.
 */
export function requireApiKey(configured: string): RequestHandler {
  if (configured.length < MIN_KEY_LENGTH) {
    throw new Error(
      `MGI_API_KEY must be at least ${MIN_KEY_LENGTH} characters. Generate one with: openssl rand -hex 32`,
    );
  }
  const expected = digest(configured);

  return (req, res, next) => {
    const presented = req.get("x-api-key") ?? bearer(req.get("authorization"));
    if (!presented || !matches(expected, presented)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? value : undefined;
}

/** Hashing both sides keeps the comparison constant-time across unequal lengths. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function matches(expected: Buffer, presented: string): boolean {
  return timingSafeEqual(expected, digest(presented));
}
