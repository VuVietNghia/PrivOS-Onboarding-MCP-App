import type { Day, Week } from '../../domain/models';

interface WeekRailProps {
  weeks: readonly Week[];
  days: readonly Day[];
  selectedWeekId: string | null;
  selectedDayId: string | null;
  onSelectWeek: (id: string) => void;
  onSelectDay: (id: string) => void;
  onAddWeek: () => void;
  onAddDay: (weekId: string) => void;
}

export function WeekRail({ weeks, days, selectedWeekId, selectedDayId, onSelectWeek, onSelectDay, onAddWeek, onAddDay }: WeekRailProps) {
  return <aside className="v4-builder-rail" aria-label="Danh sách ngày onboarding">
    <header><strong>Tuần onboarding</strong><small>Mỗi tuần chứa các item ngày</small></header>
    <div className="v4-builder-week-list">{[...weeks].sort((a, b) => a.order - b.order).map((week, index) => {
      const weekDays = days.filter((day) => day.stageId === week.id).sort((a, b) => a.order - b.order);
      const open = week.id === selectedWeekId;
      return <section key={week.id} className={open ? 'active' : ''}>
        <button type="button" className="v4-builder-week" aria-expanded={open} onClick={() => onSelectWeek(week.id)}><span>S{String(index + 1).padStart(2, '0')}</span><strong>{week.name}</strong><small>{weekDays.length} ngày</small></button>
        {open && <div>{weekDays.map((day) => <button type="button" className="v4-builder-day" aria-current={day.id === selectedDayId ? 'step' : undefined} key={day.id} onClick={() => onSelectDay(day.id)}>{day.name || `Ngày ${day.order}`}</button>)}
          <button id={`v4-builder-${week.id}-days`} type="button" className="v4-builder-rail-action" onClick={() => onAddDay(week.id)}>Thêm ngày</button>
        </div>}
      </section>;
    })}</div>
    <button id="v4-builder-add-week" type="button" className="v4-builder-rail-action" onClick={onAddWeek}>Thêm tuần</button>
  </aside>;
}
