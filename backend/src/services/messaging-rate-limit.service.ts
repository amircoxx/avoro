/** Provides bounded in-process sliding-window limits for messaging HTTP requests. */
type SlidingWindowLimiterOptions = {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
};

type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function createSlidingWindowLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }: SlidingWindowLimiterOptions) {
  const eventsByKey = new Map<string, number[]>();

  return {
    consume(key: string): LimitResult {
      const current = now();
      const cutoff = current - windowMs;
      for (const [existingKey, events] of [...eventsByKey]) {
        const activeEvents = events.filter((eventAt) => eventAt > cutoff);
        if (activeEvents.length === 0) eventsByKey.delete(existingKey);
        else eventsByKey.set(existingKey, activeEvents);
      }

      const events = eventsByKey.get(key) ?? [];

      if (events.length >= limit) {
        eventsByKey.set(key, events);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((events[0] + windowMs - current) / 1_000)) };
      }

      if (!eventsByKey.has(key) && eventsByKey.size >= maxKeys) {
        let earliestKeyExpiry = Number.POSITIVE_INFINITY;
        for (const activeEvents of eventsByKey.values()) {
          let latestEventAt = 0;
          for (const eventAt of activeEvents) {
            latestEventAt = Math.max(latestEventAt, eventAt);
          }
          earliestKeyExpiry = Math.min(earliestKeyExpiry, latestEventAt + windowMs);
        }
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((earliestKeyExpiry - current) / 1_000)) };
      }
      events.push(current);
      eventsByKey.set(key, events);
      return { allowed: true };
    },

    activeKeyCount() {
      return eventsByKey.size;
    }
  };
}
