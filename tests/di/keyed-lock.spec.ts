import { expect, it } from 'vitest';
import { createLifetime } from '../../src/shared/lifetime';
import { createKeyedLock } from '../../src/shared/keyed-lock';

it('rejects a concurrent operation on the same hire and releases after failure', async () => {
  const lock = createKeyedLock(createLifetime());
  let release: () => void = () => { throw new Error('NOT_STARTED'); };
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = lock.run('hire-1', async () => { await gate; throw new Error('IO_FAILED'); });
  const firstResult = expect(first).rejects.toThrow('IO_FAILED');
  await expect(lock.run('hire-1', async () => 2)).rejects.toThrow('WRITE_CONFLICT');
  release();
  await firstResult;
  await expect(lock.run('hire-1', async () => 3)).resolves.toBe(3);
});

it('uses a separate lock for another session', async () => {
  const first = createKeyedLock(createLifetime());
  const second = createKeyedLock(createLifetime());
  let release: () => void = () => { throw new Error('NOT_STARTED'); };
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pending = first.run('hire-1', async () => { await gate; return 1; });
  await expect(second.run('hire-1', async () => 2)).resolves.toBe(2);
  release();
  await expect(pending).resolves.toBe(1);
});
