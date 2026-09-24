import { useState } from 'react';
import type { Position, TemplateTree } from '../../domain/models';
import type { CopySelection } from '../../domain/select-template';

export interface CopySource { position: Position; tree: TemplateTree }
export interface CopyTemplateDialogProps {
  sources: readonly CopySource[];
  onCopy: (source: Position, selection: CopySelection) => Promise<void> | void;
  onClose: () => void;
  loading?: boolean;
  error?: string;
}

export function CopyTemplateDialog({ sources, onCopy, onClose, loading = false, error }: CopyTemplateDialogProps) {
  const [sourceId, setSourceId] = useState(sources[0]?.position.id ?? '');
  const [mode, setMode] = useState<CopySelection['kind']>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState(false);
  const source = sources.find((entry) => entry.position.id === sourceId);
  const weeks = [...(source?.tree.weeks ?? [])].sort((a, b) => a.order - b.order);
  const days = source?.tree.items.filter((item) => item.kind === 'day') ?? [];
  const selection: CopySelection = mode === 'all' ? { kind: 'all' } :
    mode === 'weeks' ? { kind: 'weeks', weekIds: selected } : { kind: 'days', dayIds: selected };
  const canCopy = Boolean(source && !loading && !pending && (mode === 'all' ? days.length : selected.length));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const copy = async () => {
    if (!source || !canCopy) return;
    setPending(true); setLocalError(false);
    try { await onCopy(source.position, selection); onClose(); }
    catch { setLocalError(true); }
    finally { setPending(false); }
  };
  return <div role="dialog" aria-modal="true" aria-label="Copy template">
    <h2>Copy template</h2>
    <label>Vị trí nguồn<select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setSelected([]); }}>
      {sources.map(({ position }) => <option key={position.id} value={position.id}>{position.name}</option>)}
    </select></label>
    {!sources.length && <p>Chưa có template nguồn.</p>}
    {loading && <p role="status">Đang tải template…</p>}
    {source && <fieldset disabled={pending || loading}><legend>Nội dung copy</legend>
      <label><input type="radio" name="copy-scope" checked={mode === 'all'} onChange={() => { setMode('all'); setSelected([]); }} />Toàn bộ</label>
      <label><input type="radio" name="copy-scope" checked={mode === 'weeks'} onChange={() => { setMode('weeks'); setSelected([]); }} />Chọn tuần</label>
      <label><input type="radio" name="copy-scope" checked={mode === 'days'} onChange={() => { setMode('days'); setSelected([]); }} />Chọn ngày</label>
      {mode === 'weeks' && weeks.map((week) => <label key={week.id}><input type="checkbox" checked={selected.includes(week.id)}
        onChange={() => toggle(week.id)} />{week.name}</label>)}
      {mode === 'days' && weeks.flatMap((week) => days.filter((day) => day.stageId === week.id)
        .sort((a, b) => a.order - b.order).map((day) => <label key={day.id}><input type="checkbox"
          checked={selected.includes(day.id)} onChange={() => toggle(day.id)} />{day.name}</label>))}
    </fieldset>}
    {(error || localError) && <p role="alert">{error ?? 'Không copy được template. Thử lại.'}</p>}
    <button type="button" onClick={onClose} disabled={pending}>Đóng</button>
    <button type="button" disabled={!canCopy} onClick={() => void copy()}>{pending ? 'Đang copy…' : 'Copy template'}</button>
  </div>;
}
