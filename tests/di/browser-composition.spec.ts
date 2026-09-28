import { expect, it, vi } from 'vitest';
import { createSessionScope } from '../../src/ui/composition/create-onboarding-services';
import { createLifetime } from '../../src/shared/lifetime';

it('disposes pending session work after switching identity', async () => {
  const lifetime = createLifetime();
  let resolve: (value: { state: 'needs-admin' }) => void = () => { throw new Error('NOT_STARTED'); };
  const pending = new Promise<{ state: 'needs-admin' }>((done) => { resolve = done; });
  const dispose = vi.fn();
  const scope = createSessionScope({
    actor: { roomId: 'room', roomType: 'c', userId: 'user', roles: [], grantedScopes: [] },
    lifetime, budget: { dispose }, bootstrap: () => pending,
  });
  const request = scope.bootstrap();
  scope.dispose();
  resolve({ state: 'needs-admin' });
  await expect(request).rejects.toThrow('SCOPE_DISPOSED');
  expect(dispose).toHaveBeenCalledOnce();
});
