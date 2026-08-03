import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";
import { RATE_LIMIT_CONFIG, type RateLimitPolicyName } from "./rate-limit-config";

// Cache instances to reuse them across requests (stateless singleton pattern)
const limiters = new Map<RateLimitPolicyName, Ratelimit>();

export function getLimiter(policy: RateLimitPolicyName): Ratelimit | null {
  // Gracefully bypass if Redis client is not initialized (e.g. unconfigured environments)
  if (!redis) {
    return null;
  }

  let limiter = limiters.get(policy);
  if (!limiter) {
    const config = RATE_LIMIT_CONFIG[policy];

    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        config.limit,
        config.window as Parameters<typeof Ratelimit.slidingWindow>[1]
      ),
      prefix: `rate:${policy}`,
      analytics: true,
    });
    limiters.set(policy, limiter);
  }

  return limiter;
}
