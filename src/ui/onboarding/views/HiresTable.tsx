// src/ui/onboarding/views/HiresTable.tsx
import { useState } from 'react';
import { HIRE_STAGES } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';
import { hireLabel } from '../domain/hire-label';
import type { Hire } from '../domain/schemas';

export interface HiresTableProps {
  hires: Hire[]; stages: StageRef[];
  onSelect: (hire: Hire) => void; onResume: (hire: Hire) => void; onCancel: (hire: Hire) => void;
  disabled?: boolean;
  /** user id → display name from the room member list. */
  names: ReadonlyMap<string, string>;
}

export function HiresTable({ hires, stages, onSelect, onResume, onCancel, disabled, names }: HiresTableProps) {
  const [filter, setFilter] = useState<string>('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const stageName = (id: string) => stages.find((s) => s._id === id)?.name ?? '—';
  const rows = hires.filter((h) => !filter || stageName(h.stageId) === filter);
  return (
    <div className="items-table-wrapper">
      <div className="list-select-row">
        <label>Trạng thái{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Tất cả</option>
            {stages.map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <table className="items-table">
        <thead><tr><th>Nhân sự</th><th>Vị trí</th><th>Bắt đầu</th><th>Tiến độ</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {rows.map((h) => {
            const name = stageName(h.stageId);
            const percent = h.totalCount === 0 ? 0 : Math.round((h.doneCount / h.totalCount) * 100);
            // Cả `failed` lẫn `provisioning` đều là hồ sơ khởi tạo dở dang: một
            // tab bị đóng giữa chừng lúc đang tạo task chết trước khi
            // finish()/markFailed() kịp chạy, để hồ sơ kẹt ở provisioning mãi
            // mãi. resumeProvision xử lý được cả hai stage này.
            const canResume = name === HIRE_STAGES.failed || name === HIRE_STAGES.provisioning;
            // Hủy là lối thoát chung cho MỌI stage khác "Hoàn tất" — kể cả
            // "Đang onboarding" (template 0 task, ASSIGNEE gán sai id, hoặc bất
            // kỳ ngõ cụt nào khác không có đường quay lại qua "Tiếp tục"). Không
            // giới hạn theo canResume: hồ sơ "Đang onboarding" không resume
            // được (đã có ASSIGNEE, resumeProvision không dành cho stage này)
            // nhưng vẫn phải hủy được.
            const canCancel = name !== HIRE_STAGES.completed;
            const confirming = confirmingId === h.id;
            return (
              <tr key={h.id}>
                <td>{hireLabel(h, names)}</td>
                <td>{h.position}</td>
                <td>{h.startDate}</td>
                <td>{h.doneCount}/{h.totalCount} ({percent}%)</td>
                <td>{name}{h.errorCode ? ` (${h.errorCode})` : ''}</td>
                <td className="action-cell">
                  <button type="button" className="btn-edit" onClick={() => onSelect(h)}>Xem</button>
                  {canResume && <button type="button" className="btn-save" disabled={disabled} onClick={() => onResume(h)}>Tiếp tục</button>}
                  {canCancel && (confirming ? <>
                    <button type="button" className="btn-delete" disabled={disabled} onClick={() => { onCancel(h); setConfirmingId(null); }}>Xác nhận hủy?</button>
                    <button type="button" className="btn-cancel-edit" disabled={disabled} onClick={() => setConfirmingId(null)}>Thôi</button>
                  </> : (
                    <button type="button" className="btn-delete" disabled={disabled} onClick={() => setConfirmingId(h.id)}>Hủy</button>
                  ))}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={6} className="empty-text">Chưa có hồ sơ.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
