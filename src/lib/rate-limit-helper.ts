import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getLimiter } from "./rate-limit";
import type { RateLimitPolicyName } from "./rate-limit-config";

export interface RateLimitResult {
  enabled: boolean;
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  headers?: Record<string, string>;
  response?: NextResponse;
}

/**
 * Reusable helper to enforce rate limiting on any API route.
 * Automatically resolves client IP, determines the correct policy limiter,
 * checks quotas in Redis, writes audit console logs, and builds standard 429 blocks.
 */
export async function checkRateLimit(
  request: NextRequest,
  policy: RateLimitPolicyName
): Promise<RateLimitResult> {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    (request as NextRequest & { ip?: string }).ip ||
    "127.0.0.1";

  const limiter = getLimiter(policy);

  if (!limiter) {
    return {
      enabled: false,
      success: true,
      limit: 0,
      remaining: 0,
      reset: Date.now(),
    };
  }

  try {
    const result = await limiter.limit(ip);
    const limit = result.limit;
    const remaining = result.remaining;
    const reset = result.reset;
    const now = Date.now();
    const retryAfterSec = Math.max(0, Math.ceil((reset - now) / 1000));
    const resetSec = Math.ceil(reset / 1000);

    const headers = {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": remaining.toString(),
      "X-RateLimit-Reset": resetSec.toString(),
      "Retry-After": retryAfterSec.toString(),
    };

    if (!result.success) {
      const timestamp = new Date().toISOString();

      console.warn(
        `[RATE_LIMIT_BLOCKED] Timestamp=${timestamp} Endpoint=${request.nextUrl.pathname} Method=${request.method} IP=${ip} RetryAfter=${retryAfterSec} Limit=${limit} Remaining=${remaining}`
      );

      const response = NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests.",
            retryAfter: retryAfterSec,
            limit,
            remaining,
          },
        },
        {
          status: 429,
          headers,
        }
      );

      return {
        enabled: true,
        success: false,
        limit,
        remaining,
        reset,
        headers,
        response,
      };
    }

    return {
      enabled: true,
      success: true,
      limit,
      remaining,
      reset,
      headers,
    };
  } catch (error) {
    console.error(
      `[RATE_LIMIT_ERROR] Failed to evaluate policy=${policy} endpoint=${request.nextUrl.pathname} method=${request.method}; allowing request.`,
      error
    );

    return {
      enabled: false,
      success: true,
      limit: 0,
      remaining: 0,
      reset: Date.now(),
    };
  }
}
