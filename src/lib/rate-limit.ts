import { NextResponse } from "next/server";

// In-memory sliding window rate limiter.
// Provides per-isolate protection on Vercel serverless.
// To upgrade to distributed rate limiting, swap this file
// to use @upstash/ratelimit with the same function signatures.

const LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  analyze: { maxRequests: 10, windowMs: 60_000 },
  chat: { maxRequests: 20, windowMs: 60_000 },
  checkout: { maxRequests: 5, windowMs: 60_000 },
  "billing-portal": { maxRequests: 5, windowMs: 60_000 },
  standard: { maxRequests: 30, windowMs: 60_000 },
};

const store = new Map<string, number[]>();
let callCount = 0;

function prune() {
  const now = Date.now();
  for (const [key, timestamps] of store) {
    const filtered = timestamps.filter((t) => now - t < 120_000);
    if (filtered.length === 0) {
      store.delete(key);
    } else {
      store.set(key, filtered);
    }
  }
}

export function checkRateLimit(
  userId: string,
  endpoint: string
): { limited: boolean; retryAfter?: number } {
  const config = LIMITS[endpoint] ?? LIMITS.standard;
  const key = `${userId}:${endpoint}`;
  const now = Date.now();

  // Prune stale entries periodically
  if (++callCount % 100 === 0) prune();

  const timestamps = store.get(key) ?? [];
  const windowStart = now - config.windowMs;
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= config.maxRequests) {
    const oldest = recent[0];
    const retryAfter = Math.ceil((oldest + config.windowMs - now) / 1000);
    return { limited: true, retryAfter: Math.max(retryAfter, 1) };
  }

  recent.push(now);
  store.set(key, recent);
  return { limited: false };
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    }
  );
}
