import { expect, it } from 'vitest';
import { runImport } from '../../scripts/onboarding-import/cli-composition';

it('rejects CLI write mode before reading a source without an authenticated transport', async () => {
  let read = false;
  const source = { async *positions() { read = true; } };
  const iterator = runImport({ mode: 'write', source });
  await expect(iterator.next()).rejects.toThrow('IMPORT_WRITE_TRANSPORT_UNAVAILABLE');
  expect(read).toBe(false);
});
