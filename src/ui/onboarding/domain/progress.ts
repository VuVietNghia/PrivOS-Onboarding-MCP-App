import type { StageRef } from './roadmap-plan';
import type { RoadmapTask } from './schemas';
import { workingDaysUntil } from './working-days';

export interface Progress { done: number; total: number; percent: number; overdue: number; nextDeadline: string | null }

const DUE_SOON_WORKING_DAYS = 2;

function childTasks(tasks: RoadmapTask[]): RoadmapTask[] {
  return tasks.filter((t) => t.parentId !== null);
}

export function computeProgress(tasks: RoadmapTask[], today: string): Progress {
  const children = childTasks(tasks);
  const total = children.length;
  const done = children.filter((t) => t.done).length;
  const open = children.filter((t) => !t.done);
  const overdue = open.filter((t) => t.deadline !== null && t.deadline < today).length;
  const upcoming = open.map((t) => t.deadline).filter((d): d is string => d !== null && d >= today).sort();
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100), overdue, nextDeadline: upcoming[0] ?? null };
}

export type TaskBadge = 'overdue' | 'dueSoon' | 'hr' | 'done' | null;

export function taskBadge(task: RoadmapTask, today: string): TaskBadge {
  if (task.done) return 'done';
  if (task.deadline !== null) {
    if (task.deadline < today) return 'overdue';
    if (workingDaysUntil(today, task.deadline) <= DUE_SOON_WORKING_DAYS) return 'dueSoon';
  }
  if (task.owner === 'HR') return 'hr';
  return null;
}

export function groupByStage(tasks: RoadmapTask[], stages: StageRef[]): { stage: StageRef; tasks: RoadmapTask[] }[] {
  const sortedStages = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const children = childTasks(tasks);
  return sortedStages.map((stage) => ({
    stage,
    tasks: children
      .filter((t) => t.stageId === stage._id)
      .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '') || a.name.localeCompare(b.name)),
  }));
}

export function canToggle(task: RoadmapTask, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return task.owner === 'Nhân sự' && task.assigneeIds.includes(userId);
}
