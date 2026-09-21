// src/ui/onboarding/views/MyRoadmap.tsx
import { usePrivosContext } from '@privos_ai/app-react';
import { HIRE_STAGES } from '../domain/fields';
import { ErrorBanner } from './ErrorBanner';
import { RoadmapView } from './RoadmapView';
import { useHires } from './use-hires';

export function MyRoadmap() {
  const { roomId, userId } = usePrivosContext();
  const hires = useHires(roomId);
  if (hires.state === 'loading') return <p className="loading-text">Đang tải…</p>;
  if (hires.state === 'error') return <ErrorBanner error={hires.error} />;
  const mine = hires.hires.find((h) => h.employeeIds.includes(userId));
  if (!mine || !hires.list) {
    // `find` chạy trên danh sách có thể đã bị cắt còn 500 item (thiếu quyền
    // lists:query). Nếu vậy, không được khẳng định chắc chắn là "chưa có" —
    // hồ sơ có thể nằm ngoài lát cắt.
    if (hires.capped) return <p className="empty-text">Danh sách bị giới hạn 500 hồ sơ (thiếu quyền lists:query), không tìm được lộ trình của bạn. Hãy nhờ admin kiểm tra trực tiếp.</p>;
    return <p className="empty-text">Chưa có lộ trình onboarding.</p>;
  }
  const stageName = hires.stages.find((s) => s._id === mine.stageId)?.name;
  return (
    <div>
      <h2>Lộ trình của tôi · {mine.position}</h2>
      <p className="items-count">Bắt đầu {mine.startDate} · {stageName ?? '—'}{stageName === HIRE_STAGES.completed ? ' · Đã hoàn tất' : ''}</p>
      <RoadmapView hire={mine} hiresList={hires.list} hireIds={hires.ids} hireStages={hires.stages} isAdmin={false} onChanged={hires.reload} />
    </div>
  );
}
