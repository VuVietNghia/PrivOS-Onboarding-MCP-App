import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Day, Hire, Lesson, Question, Roadmap } from '../../domain/models';
import { formatDateOnly, formatPercent } from '../../../i18n/formatters';
import { parseLocale } from '../../../i18n/locale';

export interface WeekRoadmapProps {
  roadmap: Roadmap;
  hire: Hire;
  selectedDayId?: string;
  onDay: (dayId: string) => void;
  loading?: boolean;
  error?: string;
}

type DayState = 'completed' | 'inProgress' | 'notStarted';

function state(day: Day, children: readonly (Lesson | Question)[], hire: Hire): DayState {
  if (hire.scores[String(day.order)]) return 'completed';
  const lessons = children.filter((item): item is Lesson => item.kind === 'lesson');
  const questions = children.filter((item): item is Question => item.kind === 'question');
  if (!questions.length && lessons.length && lessons.every((item) => item.read)) return 'completed';
  if (lessons.some((item) => item.read) || questions.some((item) => item.selectedLabels.length)) return 'inProgress';
  return 'notStarted';
}

export function WeekRoadmap({ roadmap, hire, selectedDayId, onDay, loading, error }: WeekRoadmapProps) {
  const { t, i18n } = useTranslation('learning');
  const locale = parseLocale(i18n.resolvedLanguage) ?? 'vi';
  const [collapsedWeeks, setCollapsedWeeks] = useState<ReadonlySet<string>>(() => new Set());
  if (loading) return <p role="status">{t('roadmap.loading')}</p>;
  if (error) return <p role="alert">{error}</p>;
  const days = roadmap.tree.items.filter((item): item is Day => item.kind === 'day');
  const progress = hire.totalDays ? Math.min(100, Math.round(hire.doneDays / hire.totalDays * 100)) : 0;
  const toggleWeek = (weekId: string) => setCollapsedWeeks((current) => {
    const next = new Set(current);
    if (next.has(weekId)) next.delete(weekId); else next.add(weekId);
    return next;
  });
  return <section className="v4-roadmap" aria-label={t('roadmap.region')}>
    <header className="v4-learning-hero"><div><p className="v4-eyebrow">{t('roadmap.title')}</p><h1>{hire.positionName}</h1>
      <p>{t('roadmap.started', { date: formatDateOnly(hire.startDate, locale) })} · {t('roadmap.progress', { done: hire.doneDays, total: hire.totalDays })}</p></div>
      <strong>{formatPercent(progress / 100, locale)}</strong><div className="v4-learning-progress" role="progressbar" aria-label={t('roadmap.progressLabel')} aria-valuemin={0}
        aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div></header>
    {!roadmap.tree.weeks.length || !days.length
      ? <p>{t('roadmap.emptyDays')}</p>
      : [...roadmap.tree.weeks].sort((a, b) => a.order - b.order).map((week) => {
        const expanded = !collapsedWeeks.has(week.id);
        const panelId = `learning-week-${week.id}`;
        return <section className="v4-learning-week" key={week.id} aria-label={week.name}>
        <button type="button" className="v4-learning-week-toggle" aria-expanded={expanded} aria-controls={panelId}
          onClick={() => toggleWeek(week.id)}>{week.name}</button>
        {expanded && <ul id={panelId}>{days.filter((day) => day.stageId === week.id).sort((a, b) => a.order - b.order).map((day) => {
          const children = roadmap.tree.items.filter((item): item is Lesson | Question =>
            item.kind !== 'day' && item.parentId === day.id);
          const first = hire.scores[String(day.order)]?.first;
          return <li key={day.id}><button type="button" aria-current={selectedDayId === day.id ? 'step' : undefined}
            onClick={() => onDay(day.id)}><span>{day.name} · {t(`roadmap.state.${state(day, children, hire)}`)}</span>
            {first && <small>{t('roadmap.firstScore')}: {first}</small>}</button></li>;
        })}</ul>}
      </section>;
      })}
  </section>;
}
