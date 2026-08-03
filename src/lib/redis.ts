import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const isRedisConfigured = Boolean(redisUrl && redisToken);

let hasWarnedMissingConfig = false;

if (!isRedisConfigured && !hasWarnedMissingConfig) {
  hasWarnedMissingConfig = true;
  console.warn(
    "[RATE_LIMIT_DISABLED] Missing Upstash Redis environment variables; rate limiting is running in fail-open mode."
  );
}

// Create a singleton Upstash Redis client.
// Returns null if environment variables are not set, allowing the rate limiter
// to fall back gracefully (fail-open) in local development setups.
export const redis = isRedisConfigured
  ? new Redis({
      url: redisUrl,
      token: redisToken,
    })
  : null;

export { isRedisConfigured };
