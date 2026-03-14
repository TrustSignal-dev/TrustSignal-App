export class ReplayStore {
  private readonly ttlMs: number;
  private readonly values = new Map<string, number>();

  constructor(ttlMs = 15 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  has(key: string, now = Date.now()) {
    this.prune(now);
    const expiresAt = this.values.get(key);
    return typeof expiresAt === "number" && expiresAt > now;
  }

  add(key: string, now = Date.now()) {
    this.prune(now);
    this.values.set(key, now + this.ttlMs);
  }

  prune(now = Date.now()) {
    for (const [key, expiresAt] of this.values.entries()) {
      if (expiresAt <= now) {
        this.values.delete(key);
      }
    }
  }
}
