import { expect, it } from 'vitest';
import { createBrowserEffects } from '../../src/ui/adapters/browser-effects';

it('uses stable SHA-256 bytes for import source identity', async () => {
  expect(await createBrowserEffects().hasher.sha256('abc')).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
