import { useState } from 'react';
import type { Day, Hire, Lesson, Question, Roadmap } from '../../domain/models';
import type { OnboardingLocale } from '../OnboardingShell';
import { learningCopy, type LearningCopy } from './learning-copy';

export interface WeekRoadmapProps {
  roadmap: Roadmap;
  hire: Hire;
  selectedDayId?: string;
  onDay: (dayId: string) => void;
  loading?: boolean;
  error?: string;
  locale: OnboardingLocale;
}

function state(day: Day, children: readonly (Lesson | Question)[], hire: Hire, copy: LearningCopy): string {
  if (hire.scores[String(day.order)]) return copy.completed;
  const lessons = children.filter((item): item is Lesson => item.kind === 'lesson');
  const questions = children.filter((item): item is Question => item.kind === 'question');
  if (!questions.length && lessons.length && lessons.every((item) => item.read)) return copy.completed;
  if (lessons.some((item) => item.read) || questions.some((item) => item.selectedLabels.length)) return copy.inProgress;
  return copy.notStarted;
}

export function WeekRoadmap({ roadmap, hire, selectedDayId, onDay, loading, error, locale }: WeekRoadmapProps) {
  const t = learningCopy(locale);
  const [collapsedWeeks, setCollapsedWeeks] = useState<ReadonlySet<string>>(() => new Set());
  if (loading) return <p role="status">{t.loadingRoadmap}</p>;
  if (error) return <p role="alert">{error}</p>;
  const days = roadmap.tree.items.filter((item): item is Day => item.kind === 'day');
  const progress = hire.totalDays ? Math.min(100, Math.round(hire.doneDays / hire.totalDays * 100)) : 0;
  const toggleWeek = (weekId: string) => setCollapsedWeeks((current) => {
    const next = new Set(current);
    if (next.has(weekId)) next.delete(weekId); else next.add(weekId);
    return next;
  });
  return <section className="v4-roadmap" aria-label={t.roadmapRegion}>
    <header className="v4-learning-hero"><div><p className="v4-eyebrow">{t.roadmapTitle}</p><h1>{hire.positionName}</h1>
      <p>{t.startDate} {hire.startDate} · {hire.doneDays}/{hire.totalDays} {t.completedDays}</p></div>
      <strong>{progress}%</strong><div className="v4-learning-progress" role="progressbar" aria-valuemin={0}
        aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div></header>
    {!roadmap.tree.weeks.length || !days.length
      ? <p>{t.noDays}</p>
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
            onClick={() => onDay(day.id)}><span>{day.name} · {state(day, children, hire, t)}</span>
            {first && <small>{t.firstScore}: {first}</small>}</button></li>;
        })}</ul>}
      </section>;
      })}
  </section>;
}
