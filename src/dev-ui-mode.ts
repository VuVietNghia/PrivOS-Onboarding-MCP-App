import type { RuntimeMode } from '@privos_ai/app-server';

type DevUiEnvironment = Readonly<{ NODE_ENV?: string; PRIVOS_DEV_UI?: string }>;

/** A live UI may only be served from an explicit local, non-production session. */
export function shouldStartDevUi(
  mode: RuntimeMode,
  transportOverride: 'relay' | undefined,
  environment: DevUiEnvironment,
): boolean {
  return environment.PRIVOS_DEV_UI === '1'
    && environment.NODE_ENV !== 'production'
    && (mode === 'standalone-production' || (mode === 'development' && transportOverride === 'relay'));
}
