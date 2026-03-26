import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });

/**
 * Retry a database operation with exponential backoff.
 * Use for critical operations that must not silently fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; label?: string }
): Promise<T> {
  const maxRetries = opts?.retries ?? 3;
  const label = opts?.label ?? "db-operation";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`[${label}] Failed after ${maxRetries + 1} attempts:`, err);
        throw err;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.warn(
        `[${label}] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}
