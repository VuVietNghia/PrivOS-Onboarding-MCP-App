import { describe, expect, it } from 'vitest';
import { checkDependencies } from '../../scripts/architecture/check-dependencies';

describe('DI architecture gate', () => {
  it('rejects SDK imports, re-exports, dynamic imports and ambient aliases in flow code', () => {
    const violations = checkDependencies([{ path: 'src/ui/onboarding/flows/bad.ts', text: `
      import { usePrivosApp as useApp } from '@privos_ai/app-react';
      export { usePrivosApp as host } from '@privos_ai/app-react';
      const loader = () => import('@privos_ai/app-react');
      const runtime = globalThis;
      export const id = () => runtime.crypto.randomUUID();
      export const today = () => new Date();
    ` }]);
    expect(violations.filter((value) => value.rule === 'SDK_BOUNDARY')).toHaveLength(3);
    expect(violations.some((value) => value.rule === 'AMBIENT_EFFECT' && value.target.includes('crypto'))).toBe(true);
    expect(violations.some((value) => value.rule === 'AMBIENT_EFFECT' && value.target === 'Date')).toBe(true);
  });

  it('permits injected effects, date parsing and concrete SDK adapters', () => {
    expect(checkDependencies([{ path: 'src/ui/onboarding/flows/good.ts', text: `
      export const today = (clock: { now(): Date }, iso: string) => [clock.now(), new Date(iso)];
      export const local = (window: { value: number }) => window.value;
    ` }, { path: 'src/ui/onboarding/data/privos/app.ts', text: `
      import { usePrivosApp } from '@privos_ai/app-react';
      export const get = () => globalThis.crypto.randomUUID();
    ` }])).toEqual([]);
  });

  it('rejects mutable module state in pure modules', () => {
    const violations = checkDependencies([{ path: 'src/ui/onboarding/domain/bad.ts', text: 'let active: string[] = []; const cache = new Map<string, string>(); export const add = (id: string) => active.push(id);' }]);
    expect(violations.map((value) => value.rule)).toContain('MODULE_STATE');
    expect(violations.some((value) => value.target === 'cache')).toBe(true);
  });

  it('rejects an adapter reached through a relative import in a flow', () => {
    const violations = checkDependencies([{ path: 'src/ui/onboarding/flows/bad.ts', text:
      "import { createPrivosLists } from '../data/privos/lists-adapter'; export const run = createPrivosLists;" }]);
    expect(violations.map((value) => value.rule)).toContain('IMPORT_BOUNDARY');
  });

  it('does not let a local shadow hide an ambient read in another function', () => {
    const violations = checkDependencies([{ path: 'src/ui/onboarding/flows/bad.ts', text: `
      export const injected = (window: { id: string }) => window.id;
      export const ambient = () => window.localStorage.getItem('x');
    ` }]);
    expect(violations.some((value) => value.rule === 'AMBIENT_EFFECT' && value.target === 'window.localStorage')).toBe(true);
  });

  it('accepts a for-of binding named like a browser global', () => {
    expect(checkDependencies([{ path: 'src/shared/import/good.ts', text:
      'export const names = (items: { path: string }[]) => { for (const document of items) { if (!document.path) return false; } return true; };' }])).toEqual([]);
  });
});
