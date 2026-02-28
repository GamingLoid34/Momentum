type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

const GLOBAL_KEY = "__momentum_rate_limit_store__";

function getStore() {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Map<string, Bucket>;
  };

  if (!globalScope[GLOBAL_KEY]) {
    globalScope[GLOBAL_KEY] = new Map<string, Bucket>();
  }

  return globalScope[GLOBAL_KEY];
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const store = getStore();
  const currentBucket = store.get(key);

  if (!currentBucket || currentBucket.resetAt <= now) {
    const next: Bucket = {
      count: 1,
      resetAt: now + windowMs,
    };
    store.set(key, next);
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: next.resetAt,
    };
  }

  if (currentBucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: currentBucket.resetAt,
    };
  }

  currentBucket.count += 1;
  store.set(key, currentBucket);
  return {
    allowed: true,
    remaining: Math.max(0, limit - currentBucket.count),
    resetAt: currentBucket.resetAt,
  };
}
