/**
 * Catches a failed lazy `import()` of a panel chunk — the browser has the
 * shell cached but the hashed chunk it references is gone (upgrade swapped
 * the installation generation, or the Hub's asset cache was flushed for a
 * generation this tab still references). React's own error boundary
 * contract is the only way to intercept a rejected dynamic import inside a
 * component tree; a plain try/catch around `React.lazy` cannot, since the
 * throw happens during render, not at call time.
 *
 * Deliberately does not retry the import itself: a stale chunk reference is
 * a shell/asset mismatch that a re-fetch of the (also stale) shell cannot
 * fix, so the fallback asks for a full reload instead.
 */
import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Logger } from '../shared/ports/effects';
import type { ReloadPage } from './ports/presentation';

interface LazyBoundaryProps {
  children: ReactNode;
  reloadPage: ReloadPage;
  logger: Logger;
  copy?: { recovery: string; reload: string };
}

interface LazyBoundaryState {
  hasError: boolean;
}

export class LazyBoundary extends Component<LazyBoundaryProps, LazyBoundaryState> {
  state: LazyBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.logger.event('ui.chunk_failed', { code: 'CHUNK_UNAVAILABLE' });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const copy = this.props.copy ?? { recovery: 'A new version of this app is available.', reload: 'Reload' };
      return (
        <div className="container">
          <div className="error-message">
            {copy.recovery}
          </div>
          <button type="button" className="btn-submit" onClick={() => this.props.reloadPage.reload()}>
            {copy.reload}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LocalizedLazyBoundary(props: Omit<LazyBoundaryProps, 'copy'>) {
  const { t } = useTranslation('common');
  return <LazyBoundary {...props} copy={{ recovery: t('lazy.recovery'), reload: t('lazy.reload') }} />;
}

export default LazyBoundary;
