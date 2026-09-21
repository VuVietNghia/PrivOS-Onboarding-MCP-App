// src/ui/onboarding/views/RoadmapView.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import type { HubList } from '../data/onboarding-lists';
import type { FieldIds } from '../domain/fields';
import { canToggle, computeProgress, groupByStage, taskBadge, type TaskBadge } from '../domain/progress';
import type { StageRef } from '../domain/roadmap-plan';
import type { Hire, RoadmapTask } from '../domain/schemas';
import { loadRoadmap, type LoadedRoadmap } from '../flows/load-roadmap';
import { recountHire, toggleTask } from '../flows/toggle-task';
import { ErrorBanner } from './ErrorBanner';

const BADGE_TEXT: Record<Exclude<TaskBadge, null>, string> = { overdue: 'Quá hạn', dueSoon: 'Sắp đến hạn', hr: 'HR thực hiện', done: 'Xong' };

function today(): string { return new Date().toISOString().slice(0, 10); }

export interface RoadmapViewProps {
  hire: Hire; hiresList: HubList; hireIds: FieldIds; hireStages: StageRef[]; isAdmin: boolean; onChanged: () => void;
}

export function RoadmapView({ hire, hiresList, hireIds, hireStages, isAdmin, onChanged }: RoadmapViewProps) {
  const app = usePrivosApp();
  const { userId } = usePrivosContext();
  const [data, setData] = useState<LoadedRoadmap | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!hire.roadmapListId) return;
    const seq = ++loadSeq.current;
    try {
      const next = await loadRoadmap(app, hire.roadmapListId);
      if (loadSeq.current !== seq) return; // một load() mới hơn đã khởi chạy, bỏ kết quả cũ này
      setData(next);
      setError(null);
    } catch (err) {
      if (loadSeq.current !== seq) return;
      setError(err);
    }
  }, [app, hire.roadmapListId]);

  useEffect(() => { void load(); }, [load]);

  if (!hire.roadmapListId) return <p className="empty-text">Hồ sơ chưa có lộ trình.</p>;
  if (error && !data) return <ErrorBanner error={error} />;
  if (!data) return <p className="loading-text">Đang tải lộ trình…</p>;

  const now = today();
  const progress = computeProgress(data.tasks, now);
  const recountInput = { hireListId: hiresList._id, hireItemId: hire.id, hireIds, hireStages, roadmapListId: data.listId, runIds: data.ids, today: now, currentStageId: hire.stageId };

  async function onToggle(task: RoadmapTask, done: boolean) {
    setError(null);
    setBusyIds((prev) => new Set(prev).add(task.id));
    setData((d) => d && { ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, done } : t)) });
    try { await toggleTask(app, { ...recountInput, taskId: task.id, done }); onChanged(); }
    catch (err) { setError(err); setData((d) => d && { ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, done: !done } : t)) }); }
    finally {
      setBusyIds((prev) => { const next = new Set(prev); next.delete(task.id); return next; });
      await load();
    }
  }

  async function onRecount() {
    setError(null);
    try { await recountHire(app, recountInput); onChanged(); } catch (err) { setError(err); }
  }

  return (
    <div>
      <ErrorBanner error={error} />
      <p className="items-count">
        Hoàn thành {progress.done}/{progress.total} ({progress.percent}%) · Quá hạn: {progress.overdue}
        {progress.nextDeadline && <> · Hạn gần nhất: {progress.nextDeadline}</>}
        {data.capped && <> · Danh sách bị giới hạn 500 item (thiếu quyền lists:query)</>}
      </p>
      {data.invalid.length > 0 && <div className="error-message">{data.invalid.length} task có dữ liệu lỗi: {data.invalid.map((i) => i.itemId).join(', ')}</div>}
      {isAdmin && <button type="button" className="btn-reset" onClick={onRecount}>Tính lại tiến độ</button>}
      {groupByStage(data.tasks, data.stages).map(({ stage, tasks }) => (
        <section key={stage._id}>
          <h3>{stage.name}</h3>
          {tasks.length === 0 && <p className="empty-text">Không có task.</p>}
          <ul>
            {tasks.map((task) => {
              const badge = taskBadge(task, now);
              return (
                <li key={task.id}>
                  <label>
                    <input type="checkbox" checked={task.done} disabled={busyIds.has(task.id) || !canToggle(task, userId, isAdmin)}
                      onChange={(e) => void onToggle(task, e.target.checked)} />
                    {' '}{task.name} · hạn {task.deadline ?? '—'}
                    {badge && <span className="items-count"> [{BADGE_TEXT[badge]}]</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
