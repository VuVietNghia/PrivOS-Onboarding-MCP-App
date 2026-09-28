import { expect, it } from 'vitest';
import { createLifetime } from '../../src/shared/lifetime';

it('invalidates only the disposed scope and accepts repeated disposal', () => {
  const oldScope = createLifetime();
  const newScope = createLifetime();
  oldScope.dispose();
  oldScope.dispose();
  expect(() => oldScope.assertActive()).toThrow('SCOPE_DISPOSED');
  expect(() => newScope.assertActive()).not.toThrow();
});
