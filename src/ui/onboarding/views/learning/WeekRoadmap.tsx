import type { Day, Hire, Lesson, Question, Roadmap } from '../../domain/models';

export interface WeekRoadmapProps {
  roadmap: Roadmap;
  hire: Hire;
  selectedDayId?: string;
  onDay: (dayId: string) => void;
  loading?: boolean;
  error?: string;
}

function state(day: Day, children: readonly (Lesson | Question)[], hire: Hire): string {
  if (hire.scores[String(day.order)]) return 'Đã hoàn thành';
  const lessons = children.filter((item): item is Lesson => item.kind === 'lesson');
  const questions = children.filter((item): item is Question => item.kind === 'question');
  if (!questions.length && lessons.length && lessons.every((item) => item.read)) return 'Đã hoàn thành';
  if (lessons.some((item) => item.read) || questions.some((item) => item.selectedLabels.length)) return 'Đang học';
  return 'Chưa bắt đầu';
}

export function WeekRoadmap({ roadmap, hire, selectedDayId, onDay, loading, error }: WeekRoadmapProps) {
  if (loading) return <p role="status">Đang tải lộ trình…</p>;
  if (error) return <p role="alert">{error}</p>;
  const days = roadmap.tree.items.filter((item): item is Day => item.kind === 'day');
  return <section aria-label="Lộ trình học">
    <header><h1>{hire.positionName}</h1><p>Bắt đầu {hire.startDate} · {hire.doneDays}/{hire.totalDays} ngày hoàn thành</p></header>
    {!roadmap.tree.weeks.length || !days.length
      ? <p>Chưa có ngày học trong lộ trình.</p>
      : [...roadmap.tree.weeks].sort((a, b) => a.order - b.order).map((week) => <section key={week.id} aria-label={week.name}>
        <h2>{week.name}</h2>
        <ul>{days.filter((day) => day.stageId === week.id).sort((a, b) => a.order - b.order).map((day) => {
          const children = roadmap.tree.items.filter((item): item is Lesson | Question =>
            item.kind !== 'day' && item.parentId === day.id);
          return <li key={day.id}><button type="button" aria-current={selectedDayId === day.id ? 'step' : undefined}
            onClick={() => onDay(day.id)}>{day.name} · {state(day, children, hire)}</button></li>;
        })}</ul>
      </section>)}
  </section>;
}
