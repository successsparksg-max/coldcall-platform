import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Neon HTTP driver: each query is a single HTTP POST to Neon's query proxy.
// No persistent WebSocket, no idle connections that die on auto-suspend, no
// per-invocation control-plane wake-up. This is the recommended driver for
// Vercel serverless; the WebSocket-based Pool was producing intermittent
// "Control plane request failed" errors and uncaught WebSocket idle errors
// that killed the entire lambda. We don't use multi-statement transactions,
// so the HTTP driver's lack of real transaction support is not a constraint.
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

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
