// src/ui/onboarding/views/ProvisionForm.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { z } from 'zod';
import { listTemplateLists } from '../data/find-lists';
import type { HubList } from '../data/onboarding-lists';
import { lookupUser } from '../data/room-members';
import { pickEmployee, type RoomMember } from '../domain/pick-employee';
import { isWorkingDay } from '../domain/working-days';
import { provisionRoadmap, type ProvisionProgress } from '../flows/provision-roadmap';
import { ErrorBanner } from './ErrorBanner';

const formSchema = z.object({
  templateListId: z.string().min(1, 'Chọn vị trí'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày').refine(isWorkingDay, 'Ngày bắt đầu phải là ngày làm việc'),
});

const STEP_TEXT: Record<ProvisionProgress['step'], string> = {
  preflight: 'Kiểm tra', hire: 'Ghi hồ sơ', plan: 'Lập kế hoạch', list: 'Tạo list lộ trình', items: 'Tạo task', finish: 'Hoàn tất',
};

export interface ProvisionFormProps {
  roomId: string;
  /** Room members for the dropdown: `undefined` while loading, `null` when unavailable (typed input instead). */
  members: RoomMember[] | null | undefined;
  onDone: () => void;
}

export function ProvisionForm({ roomId, members, onDone }: ProvisionFormProps) {
  const app = usePrivosApp();
  const { userRoles } = usePrivosContext();
  const [templates, setTemplates] = useState<HubList[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [typedUser, setTypedUser] = useState('');
  const [templateListId, setTemplateListId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [progress, setProgress] = useState<ProvisionProgress | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => { listTemplateLists(app, roomId).then(setTemplates).catch((err: unknown) => setError(err)); }, [app, roomId]);

  const useDropdown = Array.isArray(members);

  async function resolveEmployeeId(): Promise<string | null> {
    if (useDropdown) {
      if (!selectedMemberId) { setFormError('Chọn nhân sự.'); return null; }
      return selectedMemberId;
    }
    const lookup = typedUser.trim() ? await lookupUser(app, typedUser) : ({ kind: 'unavailable' } as const);
    const picked = pickEmployee(typedUser, lookup);
    if (!picked.ok) { setFormError(picked.message); return null; }
    return picked.employeeId;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null); setError(null);
    const parsed = formSchema.safeParse({ templateListId, startDate });
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ'); return; }
    try {
      const employeeId = await resolveEmployeeId();
      if (!employeeId) return;
      await provisionRoadmap(app, { roomId, employeeId, ...parsed.data, userRoles: userRoles ?? [] }, setProgress);
      setSelectedMemberId(''); setTypedUser(''); setStartDate(''); onDone();
    } catch (err) { setError(err); onDone(); }
    finally { setProgress(null); }
  }

  return (
    <form className="add-record-form" onSubmit={submit}>
      <h3>Khởi tạo onboarding</h3>
      <div className="form-group">
        {members === undefined && <p className="loading-text">Đang tải thành viên room…</p>}
        {useDropdown && (
          <label>Nhân sự{' '}
            <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)}>
              <option value="">— chọn thành viên —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>)}
            </select>
          </label>
        )}
        {members === null && (
          <label>Username nhân sự <input className="edit-input" value={typedUser} onChange={(e) => setTypedUser(e.target.value)} placeholder="vd: nguyenvana" /></label>
        )}
      </div>
      <div className="form-group"><label>Vị trí{' '}
        <select value={templateListId} onChange={(e) => setTemplateListId(e.target.value)}>
          <option value="">— chọn —</option>
          {templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select></label></div>
      <div className="form-group"><label>Ngày bắt đầu <input type="date" className="edit-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label></div>
      {formError && <div className="error-message">{formError}</div>}
      <ErrorBanner error={error} />
      {progress && <p className="loading-text">{STEP_TEXT[progress.step]}{progress.step === 'items' ? ` ${progress.done}/${progress.total}` : ''}…</p>}
      <div className="form-actions"><button type="submit" className="btn-submit" disabled={progress !== null || members === undefined}>Khởi tạo</button></div>
    </form>
  );
}
