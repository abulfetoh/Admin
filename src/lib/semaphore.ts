/**
 * Counting semaphore with slot hand-off: when a task finishes and someone is waiting, the slot is passed directly
 * to the waiter instead of being released first, so a new arrival can never overtake it and push concurrency above `max`.
 */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve)); // woken with the slot already ours
    else active++;
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  };
}
