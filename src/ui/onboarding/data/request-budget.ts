import { PrivosRestError } from '../../privos-rest';

export interface RequestBudget {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export interface RequestBudgetOptions {
  maxConcurrent?: number;
  maxPerWindow?: number;
  windowMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

/** A per-catalog read scheduler. Other tabs and PrivOS apps have independent budgets. */
export function createRequestBudget(options: RequestBudgetOptions = {}): RequestBudget {
  const maxConcurrent = options.maxConcurrent ?? 4;
  const maxPerWindow = options.maxPerWindow ?? 100;
  const windowMs = options.windowMs ?? 60_000;
  const maxRetries = options.maxRetries ?? 3;
  const baseBackoffMs = options.baseBackoffMs ?? 1_000;
  const maxBackoffMs = options.maxBackoffMs ?? 8_000;
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || !Number.isInteger(maxPerWindow) || maxPerWindow < 1 || windowMs < 1 || maxRetries < 0 || baseBackoffMs < 1 || maxBackoffMs < baseBackoffMs) {
    throw new Error('REQUEST_BUDGET_INVALID');
  }

  const starts: number[] = [];
  const queue: Array<() => void> = [];
  let active = 0;
  let pausedUntil = 0;
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;

  function drain(): void {
    if (wakeTimer !== undefined) {
      clearTimeout(wakeTimer);
      wakeTimer = undefined;
    }
    const now = Date.now();
    while (starts.length && starts[0] <= now - windowMs) starts.shift();
    while (queue.length && active < maxConcurrent && starts.length < maxPerWindow && Date.now() >= pausedUntil) {
      const start = queue.shift();
      if (!start) break;
      starts.push(Date.now());
      active += 1;
      start();
    }
    if (!queue.length || active >= maxConcurrent) return;
    const nextWindow = starts.length >= maxPerWindow ? starts[0] + windowMs : 0;
    const nextStart = Math.max(nextWindow, pausedUntil);
    if (nextStart > Date.now()) wakeTimer = setTimeout(drain, nextStart - Date.now());
  }

  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        let retries = 0;
        const start = (): void => {
          let outcome: Promise<T>;
          try { outcome = operation(); }
          catch (error) { outcome = Promise.reject(error); }
          void outcome.then((value) => {
            active -= 1;
            drain();
            resolve(value);
          }, (error: unknown) => {
            if (error instanceof PrivosRestError && error.statusCode === 429 && retries < maxRetries) {
              const delay = Math.min(maxBackoffMs, baseBackoffMs * 2 ** retries);
              retries += 1;
              pausedUntil = Math.max(pausedUntil, Date.now() + delay);
              queue.unshift(start);
            } else {
              reject(error);
            }
            active -= 1;
            drain();
          });
        };
        queue.push(start);
        drain();
      });
    },
  };
}
