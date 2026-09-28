import { expect, it } from 'vitest';
import { createLearningService } from '../../src/ui/onboarding/flows/learning-v4';
import { createKeyedLock } from '../../src/shared/keyed-lock';
import { createLifetime } from '../../src/shared/lifetime';
import { createListStub } from './support/list-stub';

it('rejects missing actor identity before list IO', async () => {
  const lists = createListStub();
  const service = createLearningService({
    ...lists, lock: createKeyedLock(createLifetime()),
    actor: { roomId: 'room', roomType: 'c', userId: '', roles: ['member'], grantedScopes: [] },
    binding: { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' },
  });
  await expect(service.load()).rejects.toThrow('HIRE_NOT_OWNED');
  expect(lists.read.readListInfo).not.toHaveBeenCalled();
});

it('rejects overlap and releases a failed operation', async () => {
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
