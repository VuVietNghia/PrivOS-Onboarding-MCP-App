import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomBinding } from '../../domain/models';
import { isRoomAdmin } from '../../domain/roles';
import { createBrowserPositionSource, type BrowserImportFile } from '../../flows/browser-import-v4';
import { dryRunSource, importSource } from '../../flows/import-v4';
import type { OnboardingServices } from '../../ports/ui-services';
import { getErrorMessage } from '../../../i18n/error-message';
import { toImportUiError } from '../../../i18n/import-error';
import type { UiError } from '../../../i18n/ui-error';

export interface ImportFolderPanelProps {
  binding: RoomBinding;
  roomId: string;
  userRoles: readonly string[];
  services: Pick<OnboardingServices, 'imports' | 'hasher'>;
  onDone: () => void;
}

interface PositionSummary {
  sourceKey: string;
  name: string;
  weeks: number;
  days: number;
  lessons: number;
  questions: number;
  missingAnswers: number;
  result: 'pending' | 'created' | 'existing';
}

type Phase = 'idle' | 'checking' | 'ready' | 'importing' | 'done' | 'preflight-error' | 'import-error';

export function ImportFolderPanel({ binding, roomId, userRoles, services, onDone }: ImportFolderPanelProps) {
  const { t } = useTranslation('templates');
  const { t: errorT } = useTranslation('errors');
  const [files, setFiles] = useState<BrowserImportFile[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [processed, setProcessed] = useState(0);
  const [error, setError] = useState<UiError | null>(null);
  const busy = phase === 'checking' || phase === 'importing';
  const canImport = isRoomAdmin(userRoles) && roomId === binding.roomId;

  const checkSource = async () => {
    if (!files.length || busy) return;
    setPhase('checking');
    setPositions([]);
    setProcessed(0);
    setError(null);
    try {
      const summaries: PositionSummary[] = [];
      const source = createBrowserPositionSource(files, services.hasher);
      for await (const preflight of dryRunSource(source)) {
        const { position, counts, missingAnswers } = preflight;
        summaries.push({ sourceKey: position.sourceKey, name: position.name,
          weeks: counts.weeks, days: counts.days, lessons: counts.lessons,
          questions: counts.questions, missingAnswers: missingAnswers.length, result: 'pending' });
        setPositions([...summaries]);
      }
      setPhase('ready');
    } catch (cause) {
      setPositions([]);
      setError(toImportUiError(cause));
      setPhase('preflight-error');
    }
  };

  const confirmImport = async () => {
    if (!files.length || !positions.length || !canImport || busy ||
      (phase !== 'ready' && phase !== 'import-error')) return;
    setPhase('importing');
    setError(null);
    let completed = 0;
    try {
      const source = createBrowserPositionSource(files, services.hasher);
      for await (const result of importSource(source, services.imports)) {
        completed += 1;
        setProcessed(completed);
        setPositions((current) => current.map((position) => position.sourceKey === result.preflight.position.sourceKey
          ? { ...position, result: result.state } : position));
      }
      setPhase('done');
      onDone();
    } catch (cause) {
      setError(toImportUiError(cause));
      setPhase('import-error');
    }
  };

  return <section className="v4-import-panel" aria-labelledby="v4-import-title">
    <header className="v4-import-heading">
      <div><p className="v4-eyebrow">{t('import.eyebrow')}</p><h2 id="v4-import-title">{t('import.title')}</h2></div>
      <span className="v4-import-step">{t('import.step')}</span>
    </header>
    <p className="v4-import-intro">{t('import.intro')}</p>
    <div className="v4-import-picker">
      <label htmlFor="v4-import-folder">{t('import.folder')}</label>
      <input id="v4-import-folder" type="file" multiple disabled={busy}
        ref={(element) => { element?.setAttribute('webkitdirectory', ''); }}
        onChange={(event) => { setFiles(Array.from(event.currentTarget.files ?? [])); setPhase('idle'); setPositions([]); setProcessed(0); setError(null); }} />
      <small>{files.length ? t('import.filesSelected', { count: files.length }) : t('import.folderHint')}</small>
    </div>
    <div className="v4-import-actions">
      <button type="button" className="v4-secondary-button" disabled={!files.length || busy} onClick={() => void checkSource()}>
        {phase === 'checking' ? t('import.checking') : t('import.check')}
      </button>
      <button type="button" className="v4-primary-button" disabled={!canImport || !positions.length || busy || (phase !== 'ready' && phase !== 'import-error')}
        onClick={() => void confirmImport()}>
        {phase === 'importing' ? t('import.importing') : phase === 'import-error' ? t('import.retry') : t('import.confirm', { count: positions.length })}
      </button>
    </div>
    {!canImport && <p className="v4-import-note">{t('import.adminOnly')}</p>}
    {error && <p className="v4-import-error" role="alert">{getErrorMessage(error, errorT)}</p>}
    {phase === 'checking' && <p role="status">{t('import.reading')}</p>}
    {phase === 'importing' && <p role="status">{t('import.progress', { current: Math.min(processed + 1, positions.length), total: positions.length, processed })}</p>}
    {phase === 'done' && <p role="status">{t('import.done', { count: processed })}</p>}
    {phase === 'import-error' && <p role="status">{t('import.partial', { processed, total: positions.length })}</p>}
    {!!positions.length && <div className="v4-import-report">
      <h3>{t('import.report')}</h3>
      <ol>{positions.map((position) => <li key={position.sourceKey}>
        <div className="v4-import-position-head"><strong>{position.name}</strong><span>{t(`import.result.${position.result}`)}</span></div>
        <p>{t('import.counts', { weeks: position.weeks, days: position.days, lessons: position.lessons, questions: position.questions })}</p>
        {position.missingAnswers > 0 && <small>{t('import.missingAnswers', { count: position.missingAnswers })}</small>}
      </li>)}</ol>
    </div>}
  </section>;
}
