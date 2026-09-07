const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export function takeToken(
  key: string,
  opts: { capacity: number; refillPerMs: number } = {
    capacity: 10,
    refillPerMs: 60_000 / 10,
  },
): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: opts.capacity, updatedAt: now };
    buckets.set(key, bucket);
  }

  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsed / opts.refillPerMs);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
