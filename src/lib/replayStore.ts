export class ReplayStore {
  private readonly ttlMs: number;
  private readonly values = new Map<string, { expiresAt: number; status: "in_flight" | "completed" }>();

  constructor(ttlMs = 15 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  getStatus(key: string, now = Date.now()) {
    this.prune(now);
    return this.values.get(key)?.status ?? null;
  }

  begin(key: string, now = Date.now()) {
    this.prune(now);
    const existing = this.values.get(key);
    if (existing && existing.expiresAt > now) {
      return existing.status;
    }

    this.values.set(key, { expiresAt: now + this.ttlMs, status: "in_flight" });
    return "started";
  }

  complete(key: string, now = Date.now()) {
    this.prune(now);
    this.values.set(key, { expiresAt: now + this.ttlMs, status: "completed" });
  }

  release(key: string) {
    this.values.delete(key);
  }

  prune(now = Date.now()) {
    for (const [key, value] of this.values.entries()) {
      if (value.expiresAt <= now) {
        this.values.delete(key);
      }
    }
  }
}
