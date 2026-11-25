// Tiny DB-backed sliding-window rate limiter (works across serverless instances).
import { get, run } from "./db";

/**
 * Records one hit for (bucket, key) and reports whether the caller is now over the limit
 * (more than `max` hits in the last `windowSeconds`). Over-limit hits are not recorded,
 * so a blocked client is let back in as soon as old hits age out.
 */
export async function hitRateLimit(bucket: string, key: string, opts: { max: number; windowSeconds: number }): Promise<boolean> {
  // housekeeping: drop events older than a day (cheap thanks to the index)
  if (Math.random() < 0.05) await run("DELETE FROM rate_events WHERE created_at < now() - interval '1 day'");
  const row = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key = ? AND created_at > now() - make_interval(secs => ?)",
    bucket,
    key,
    opts.windowSeconds,
  );
  if ((row?.n ?? 0) >= opts.max) return true;
  await run("INSERT INTO rate_events (bucket, key) VALUES (?, ?)", bucket, key);
  return false;
}
