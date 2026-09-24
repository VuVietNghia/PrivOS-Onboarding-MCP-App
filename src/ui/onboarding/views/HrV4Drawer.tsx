import { useEffect, useMemo, useState } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import type { Catalogs } from '../data/catalogs';
import { readItem, readListInfo } from '../data/v2-lists';
import { describeError } from '../domain/errors';
import type { Hire, RoomBinding } from '../domain/models';
import { resolveV2FieldIds, V2, V2_HIRE_FIELDS } from '../domain/v2-fields';
import { createHrV4Actions, createMcpHrV4Gateway } from '../flows/hr-v4';
import { resumeV4, templateFingerprint, type PreparedProvisionV4 } from '../flows/provision-v4';

interface Props {
  app: McpApp;
  binding: RoomBinding;
  catalogs: Catalogs;
  actorRoles: readonly string[];
  hireId: string;
  onClose: () => void;
  onChanged: () => void;
}

export function HrV4Drawer({ app, binding, catalogs, actorRoles, hireId, onClose, onChanged }: Props) {
  const [hire, setHire] = useState<Hire | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = useMemo(() => createHrV4Actions(createMcpHrV4Gateway(app, binding), binding.roomId, actorRoles),
    [app, binding, actorRoles]);
  useEffect(() => {
    let active = true;
    setHire(null); setError(null);
    void catalogs.hire(hireId).then((value) => { if (active) setHire(value); })
      .catch((cause: unknown) => { if (active) setError(describeError(cause).message); });
    return () => { active = false; };
  }, [catalogs, hireId]);

  const act = async (action: 'cancel' | 'resume' | 'recount') => {
    if (!hire || busy) return;
    setBusy(true); setError(null);
    try {
      if (action === 'cancel') {
        if (hire.status === 'failed') await actions.cancelFailed(hire.id);
        else await actions.cancelActive(hire.id);
      } else if (action === 'recount') await actions.recountPosition(hire.positionId);
      else {
        const position = await catalogs.position(hire.positionId);
        const tree = await catalogs.template(position.templateListId);
        const info = await readListInfo(app, binding.hiresListId);
        const ids = resolveV2FieldIds(info.list.fieldDefinitions, V2_HIRE_FIELDS);
        const raw = await readItem(app, binding.hiresListId, hire.id);
        const rawState = raw.customFields?.find((field) => field.fieldId === ids[V2.provision])?.value;
        if (typeof rawState !== 'string') throw new Error('PROVISION_CHECKPOINT_INVALID');
        const state: unknown = JSON.parse(rawState) as unknown;
        if (!state || typeof state !== 'object' || Array.isArray(state) || !('operationId' in state) ||
          typeof state.operationId !== 'string' || !state.operationId) throw new Error('PROVISION_CHECKPOINT_INVALID');
        const prepared: PreparedProvisionV4 = { input: { positionId: hire.positionId, employeeId: hire.employeeId,
          employeeName: hire.name, startDate: hire.startDate, operationId: state.operationId }, position, tree,
          fingerprint: await templateFingerprint(tree) };
        await resumeV4(app, binding, hire.id, prepared, actorRoles, undefined, catalogs);
      }
      setConfirmCancel(false);
      if (action === 'cancel' && hire.status === 'failed') onClose();
      else setHire(await catalogs.hire(hire.id));
      onChanged();
    } catch (cause) { setError(describeError(cause).message); }
    finally { setBusy(false); }
  };

  return <div className="v4-drawer-scrim" role="presentation" onClick={onClose}>
    <aside className="v4-drawer" role="dialog" aria-modal="true" aria-label="Chi tiết onboarding" onClick={(event) => event.stopPropagation()}>
      <header className="v4-drawer-top"><div><p className="v4-eyebrow">Onboarding</p><h2>{hire?.name ?? 'Đang tải hồ sơ'}</h2></div><button type="button" onClick={onClose}>Đóng</button></header>
      {error && <p role="alert">{error}</p>}
      {hire && <div className="v4-drawer-content"><p><strong>Vị trí:</strong> {hire.positionName}</p><p><strong>Ngày bắt đầu:</strong> {hire.startDate}</p>
        <p><strong>Trạng thái:</strong> {hire.status}</p><p><strong>Tiến độ:</strong> {hire.doneDays}/{hire.totalDays} ngày</p>
        <h3>Điểm lần đầu và lịch sử</h3>{Object.keys(hire.scores).length ? <ul>{Object.entries(hire.scores).map(([day, score]) =>
          <li key={day}>Ngày {day}: {score.first}{score.attempts?.length ? ` · ${score.attempts.join(', ')}` : ''}</li>)}</ul> : <p>Chưa có điểm.</p>}
        {(hire.status === 'failed' || hire.status === 'provisioning') && <button type="button" disabled={busy} onClick={() => void act('resume')}>Tiếp tục khởi tạo</button>}
        {(hire.status === 'learning' || hire.status === 'done' || hire.status === 'failed') && <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)}>Huỷ onboarding</button>}
        <button type="button" disabled={busy} onClick={() => void act('recount')}>Đếm lại số đang dùng</button>
      </div>}
      {confirmCancel && hire && <div className="v4-builder-dialog" role="alertdialog" aria-modal="true" aria-label="Xác nhận huỷ onboarding">
        <h3>Huỷ onboarding của {hire.name}?</h3><p>Lộ trình trong PrivOS List sẽ được xoá. Hồ sơ và điểm được giữ nếu đã bắt đầu học.</p>
        <button type="button" onClick={() => setConfirmCancel(false)} disabled={busy}>Giữ lại</button>
        <button type="button" onClick={() => void act('cancel')} disabled={busy}>{busy ? 'Đang huỷ' : 'Xác nhận huỷ'}</button>
      </div>}
    </aside>
  </div>;
}
