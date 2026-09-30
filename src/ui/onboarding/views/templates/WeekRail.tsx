import type { Day, Week } from '../../domain/models';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('templates');
  return <aside className="v4-builder-rail" aria-label={t('rail.label')}>
    <header><strong>{t('rail.title')}</strong><small>{t('rail.help')}</small></header>
    <div className="v4-builder-week-list">{[...weeks].sort((a, b) => a.order - b.order).map((week, index) => {
      const weekDays = days.filter((day) => day.stageId === week.id).sort((a, b) => a.order - b.order);
      const open = week.id === selectedWeekId;
      return <section key={week.id} className={open ? 'active' : ''}>
        <button type="button" className="v4-builder-week" aria-expanded={open} onClick={() => onSelectWeek(week.id)}><span>{t('rail.weekIndex', { index: String(index + 1).padStart(2, '0') })}</span><strong>{week.name}</strong><small>{t('rail.dayCount', { count: weekDays.length })}</small></button>
        {open && <div>{weekDays.map((day) => <button type="button" className="v4-builder-day" aria-current={day.id === selectedDayId ? 'step' : undefined} key={day.id} onClick={() => onSelectDay(day.id)}>{day.name || t('defaults.day', { count: day.order })}</button>)}
          <button id={`v4-builder-${week.id}-days`} type="button" className="v4-builder-rail-action" onClick={() => onAddDay(week.id)}>{t('rail.addDay')}</button>
        </div>}
      </section>;
    })}</div>
    <button id="v4-builder-add-week" type="button" className="v4-builder-rail-action" onClick={onAddWeek}>{t('rail.addWeek')}</button>
  </aside>;
}
