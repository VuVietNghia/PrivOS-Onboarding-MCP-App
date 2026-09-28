import type { KeyedLock, Lifetime } from './ports/effects';

export function createKeyedLock(lifetime: Lifetime): KeyedLock {
  const active = new Set<string>();
  return {
    async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      lifetime.assertActive();
      if (active.has(key)) throw new Error('WRITE_CONFLICT');
      active.add(key);
      try { return await operation(); }
      finally { active.delete(key); }
    },
  };
}
