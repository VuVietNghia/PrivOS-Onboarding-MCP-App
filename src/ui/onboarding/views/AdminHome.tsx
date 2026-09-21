// src/ui/onboarding/views/AdminHome.tsx
import { useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { ensureHiresList } from '../data/find-lists';
import { hireLabel } from '../domain/hire-label';
import type { Hire } from '../domain/schemas';
import { cancelProvision, resumeProvision } from '../flows/provision-roadmap';
import { ErrorBanner } from './ErrorBanner';
import { HiresTable } from './HiresTable';
import { ProvisionForm } from './ProvisionForm';
import { RoadmapView } from './RoadmapView';
import { useHires } from './use-hires';
import { useRoomMembers } from './use-room-members';

export function AdminHome({ onOpenTemplates }: { onOpenTemplates: () => void }) {
  const app = usePrivosApp();
  const { roomId, userRoles } = usePrivosContext();
  const hires = useHires(roomId);
  const roomMembers = useRoomMembers(roomId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = hires.hires.find((h) => h.id === selectedId) ?? null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { setError(err); } finally { setBusy(false); hires.reload(); }
  }

  const onResume = (h: Hire) => run(() => resumeProvision(app, { roomId, hireItemId: h.id, userRoles: userRoles ?? [] }));
  const onCancel = (h: Hire) => { void run(() => cancelProvision(app, { roomId, hireItemId: h.id, userRoles: userRoles ?? [] })); };
  const onBootstrap = () => run(() => ensureHiresList(app, roomId));

  return (
    <div>
      <div className="form-actions">
        <button type="button" className="btn-new-list" onClick={onOpenTemplates}>Template theo vị trí</button>
        {hires.state === 'ready' && !hires.list && <button type="button" className="btn-submit" disabled={busy} onClick={onBootstrap}>Tạo list hồ sơ nhân sự</button>}
      </div>
      <ErrorBanner error={error ?? (hires.state === 'error' ? hires.error : null)} />
      {hires.invalid.length > 0 && <div className="error-message">{hires.invalid.length} hồ sơ có dữ liệu lỗi: {hires.invalid.map((i) => i.itemId).join(', ')}</div>}
      {hires.capped && <div className="items-count">Danh sách bị giới hạn 500 hồ sơ (thiếu quyền lists:query).</div>}
      {hires.state === 'loading' && <p className="loading-text">Đang tải…</p>}
      {hires.list && <HiresTable hires={hires.hires} stages={hires.stages} onSelect={(h) => setSelectedId(h.id)} onResume={(h) => void onResume(h)} onCancel={onCancel} disabled={busy} names={roomMembers.names} />}
      {hires.list && <ProvisionForm roomId={roomId} members={roomMembers.members} onDone={hires.reload} />}
      {selected && hires.list && (
        <section>
          <h2>Lộ trình · {hireLabel(selected, roomMembers.names)} · {selected.position}</h2>
          <RoadmapView hire={selected} hiresList={hires.list} hireIds={hires.ids} hireStages={hires.stages} isAdmin onChanged={hires.reload} />
        </section>
      )}
    </div>
  );
}
