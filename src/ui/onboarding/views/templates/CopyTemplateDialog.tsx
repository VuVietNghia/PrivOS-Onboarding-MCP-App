import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Position, TemplateTree } from '../../domain/models';
import type { CopySelection } from '../../domain/select-template';
import { getErrorMessage } from '../../../i18n/error-message';
import type { UiError } from '../../../i18n/ui-error';
import { useDialogFocus } from '../use-dialog-focus';

export interface CopySource { position: Position; tree: TemplateTree }
export interface CopyTemplateDialogProps {
  sources: readonly CopySource[];
  onCopy: (source: Position, selection: CopySelection) => Promise<void> | void;
  onClose: () => void;
  loading?: boolean;
  error?: UiError;
}

export function CopyTemplateDialog({ sources, onCopy, onClose, loading = false, error }: CopyTemplateDialogProps) {
  const { t } = useTranslation('templates');
  const { t: errorT } = useTranslation('errors');
  const [sourceId, setSourceId] = useState(sources[0]?.position.id ?? '');
  const [mode, setMode] = useState<CopySelection['kind']>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<UiError | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ open: true, onClose, containerRef: dialogRef, initialFocusRef: closeRef });
  const source = sources.find((entry) => entry.position.id === sourceId);
  const weeks = [...(source?.tree.weeks ?? [])].sort((a, b) => a.order - b.order);
  const days = source?.tree.items.filter((item) => item.kind === 'day') ?? [];
  const selection: CopySelection = mode === 'all' ? { kind: 'all' } :
    mode === 'weeks' ? { kind: 'weeks', weekIds: selected } : { kind: 'days', dayIds: selected };
  const canCopy = Boolean(source && !loading && !pending && (mode === 'all' ? days.length : selected.length));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const copy = async () => {
    if (!source || !canCopy) return;
    setPending(true); setLocalError(null);
    try { await onCopy(source.position, selection); onClose(); }
    catch { setLocalError({ code: 'COPY_FAILED' }); }
    finally { setPending(false); }
  };
  return <div ref={dialogRef} className="v4-builder-dialog" role="dialog" aria-modal="true" aria-label={t('copy.label')}>
    <h2>{t('copy.title')}</h2>
    <label>{t('copy.source')}<select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setSelected([]); }}>
      {sources.map(({ position }) => <option key={position.id} value={position.id}>{position.name}</option>)}
    </select></label>
    {!sources.length && <p>{t('copy.empty')}</p>}
    {loading && <p role="status">{t('copy.loading')}</p>}
    {source && <fieldset disabled={pending || loading}><legend>{t('copy.scope')}</legend>
      <label><input type="radio" name="copy-scope" checked={mode === 'all'} onChange={() => { setMode('all'); setSelected([]); }} />{t('copy.all')}</label>
      <label><input type="radio" name="copy-scope" checked={mode === 'weeks'} onChange={() => { setMode('weeks'); setSelected([]); }} />{t('copy.weeks')}</label>
      <label><input type="radio" name="copy-scope" checked={mode === 'days'} onChange={() => { setMode('days'); setSelected([]); }} />{t('copy.days')}</label>
      {mode === 'weeks' && weeks.map((week) => <label key={week.id}><input type="checkbox" checked={selected.includes(week.id)}
        onChange={() => toggle(week.id)} />{week.name}</label>)}
      {mode === 'days' && weeks.flatMap((week) => days.filter((day) => day.stageId === week.id)
        .sort((a, b) => a.order - b.order).map((day) => <label key={day.id}><input type="checkbox"
          checked={selected.includes(day.id)} onChange={() => toggle(day.id)} />{day.name}</label>))}
    </fieldset>}
    {(error || localError) && <p role="alert">{getErrorMessage(error ?? localError ?? { code: 'COPY_FAILED' }, errorT)}</p>}
    <button ref={closeRef} type="button" onClick={onClose} disabled={pending}>{t('copy.close')}</button>
    <button type="button" disabled={!canCopy} onClick={() => void copy()}>{pending ? t('copy.pending') : t('copy.submit')}</button>
  </div>;
}
