import { describe, expect, it } from "vitest";
import { createLimiter } from "@/lib/semaphore";

describe("limiter", () => {
  it("never exceeds max concurrency, even with new arrivals racing the hand-off, and runs everything", async () => {
    const limited = createLimiter(2);
    let running = 0, peak = 0, done = 0;
    const task = () => limited(async () => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      running--; done++;
    });
    const all: Promise<void>[] = [];
    for (let i = 0; i < 40; i++) {            // staggered arrivals so some land exactly as slots are released
      all.push(task());
      if (i % 3 === 0) await new Promise((r) => setTimeout(r, 1));
    }
    await Promise.all(all);
    expect(done).toBe(40);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2); // and it really does use both slots
  });
  it("releases the slot when a task throws", async () => {
    const limited = createLimiter(1);
    await expect(limited(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await limited(async () => "ok")).toBe("ok");
  });
});
