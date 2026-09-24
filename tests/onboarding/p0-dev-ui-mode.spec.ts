import { describe, expect, it } from 'vitest';
import { shouldStartDevUi } from '../../src/dev-ui-mode';

describe('explicit local P0 UI mode', () => {
  it('starts live UI on the existing paired standalone session in development', () => {
    expect(shouldStartDevUi('standalone-production', undefined, { NODE_ENV: 'development', PRIVOS_DEV_UI: '1' })).toBe(true);
  });

  it('preserves the legacy relay development flow', () => {
    expect(shouldStartDevUi('development', 'relay', { NODE_ENV: 'development', PRIVOS_DEV_UI: '1' })).toBe(true);
  });

  it('keeps the production and default sessions on their normal built UI', () => {
    expect(shouldStartDevUi('standalone-production', undefined, { NODE_ENV: 'production', PRIVOS_DEV_UI: '1' })).toBe(false);
    expect(shouldStartDevUi('standalone-production', undefined, { NODE_ENV: 'development' })).toBe(false);
    expect(shouldStartDevUi('managed', undefined, { NODE_ENV: 'development', PRIVOS_DEV_UI: '1' })).toBe(false);
    expect(shouldStartDevUi('development', undefined, { NODE_ENV: 'development', PRIVOS_DEV_UI: '1' })).toBe(false);
  });
});
