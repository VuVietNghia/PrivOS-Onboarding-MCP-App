import type { Lifetime } from './ports/effects';

export function createLifetime(): Lifetime {
  let active = true;
  return {
    assertActive() { if (!active) throw new Error('SCOPE_DISPOSED'); },
    dispose() { active = false; },
  };
}
