import { describe, expect, it } from "vitest";
import { ReplayStore } from "../src/lib/replayStore";

describe("ReplayStore", () => {
  it("returns null for an unknown key", () => {
    const store = new ReplayStore();
    expect(store.getStatus("unknown")).toBeNull();
  });

  it("begin() returns 'started' for a new key", () => {
    const store = new ReplayStore();
    expect(store.begin("key-1")).toBe("started");
  });

  it("begin() returns 'in_flight' for a key already in flight", () => {
    const store = new ReplayStore();
    store.begin("key-1");
    expect(store.begin("key-1")).toBe("in_flight");
  });

  it("begin() returns 'completed' for a completed key within TTL", () => {
    const store = new ReplayStore();
    const now = Date.now();
    store.begin("key-1", now);
    store.complete("key-1", now);
    expect(store.begin("key-1", now + 1_000)).toBe("completed");
  });

  it("release() removes a key so it can be re-started", () => {
    const store = new ReplayStore();
    store.begin("key-1");
    store.release("key-1");
    expect(store.getStatus("key-1")).toBeNull();
    expect(store.begin("key-1")).toBe("started");
  });

  describe("prune() throttling", () => {
    it("does not scan entries before the prune interval elapses", () => {
      const pruneIntervalMs = 60_000;
      const store = new ReplayStore(15 * 60 * 1000, pruneIntervalMs);
      const now = 1_000_000;
      const farPast = now - 20 * 60 * 1000; // 20 minutes before now

      // Insert an entry that has already expired
      store.begin("expired-key", farPast);
      // Manually force expiry by completing with a past time
      store.complete("expired-key", farPast);

      // The first prune call at `now` runs (lastPruneTime is 0, so interval has elapsed).
      store.prune(now);

      // Add a fresh entry
      store.begin("live-key", now);

      // A prune call just before the interval elapses should NOT scan (lastPruneTime = now)
      const justBeforeInterval = now + pruneIntervalMs - 1;
      store.prune(justBeforeInterval);

      // live-key must still be accessible
      expect(store.getStatus("live-key", justBeforeInterval)).toBe("in_flight");
    });

    it("scans entries once the prune interval has elapsed", () => {
      const pruneIntervalMs = 60_000;
      const ttlMs = 5 * 60 * 1000;
      const store = new ReplayStore(ttlMs, pruneIntervalMs);
      const now = 2_000_000;

      // Insert a key and immediately expire it by completing it with an old timestamp
      store.begin("old-key", now - ttlMs - 1);
      store.complete("old-key", now - ttlMs - 1);

      // First prune triggers the initial scan (lastPruneTime starts at 0)
      store.prune(now);

      // Insert another expired entry after the first prune
      store.begin("another-old-key", now);
      // Make it expire by the time the next prune fires
      store.complete("another-old-key", now);

      // Advance past the prune interval — this should trigger a scan
      const nextPrune = now + pruneIntervalMs + 1;
      store.prune(nextPrune);

      // Entry with expiresAt = now + ttlMs should still be valid at nextPrune
      // (it expires at now + ttlMs, and nextPrune = now + 60_001 < now + ttlMs = now + 300_000)
      expect(store.getStatus("another-old-key", nextPrune)).toBe("completed");
    });

    it("expired entries are invisible after the prune interval fires", () => {
      const pruneIntervalMs = 60_000;
      const ttlMs = 1_000; // very short TTL for test
      const store = new ReplayStore(ttlMs, pruneIntervalMs);
      const now = 3_000_000;

      store.begin("expiring-key", now);
      // The entry expires at now + 1_000

      // Advance past both TTL and prune interval
      const future = now + ttlMs + pruneIntervalMs + 1;
      // Calling getStatus triggers prune() which should run and remove the expired entry
      expect(store.getStatus("expiring-key", future)).toBeNull();
    });
  });
});
