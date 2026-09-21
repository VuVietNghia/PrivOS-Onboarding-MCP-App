import type { TaskOwner } from './fields';
import type { TemplateTask } from './schemas';
import { addWorkingDays } from './working-days';

export interface StageRef { _id: string; name: string; order?: number }

export interface PlannedTask {
  name: string; templateTaskId: string; stageOrder: number; dayOffset: number;
  owner: TaskOwner; deadline: string; assigneeIds: string[];
}

export interface RoadmapPlan { stages: { name: string; order: number }[]; tasks: PlannedTask[] }

export function buildRoadmapPlan(input: { templateStages: StageRef[]; templateTasks: TemplateTask[]; startDate: string; employeeId: string }): RoadmapPlan {
  const sorted = [...input.templateStages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const orderById = new Map<string, number>();
  const stages = sorted.map((s, index) => {
    orderById.set(s._id, index);
    return { name: s.name, order: index };
  });
  const tasks = input.templateTasks.map((t) => {
    const stageOrder = orderById.get(t.stageId);
    if (stageOrder === undefined) throw new Error(`TEMPLATE_STAGE_MISSING:${t.id}`);
    return {
      name: t.name, templateTaskId: t.id, stageOrder, dayOffset: t.dayOffset, owner: t.owner,
      deadline: addWorkingDays(input.startDate, t.dayOffset),
      assigneeIds: t.owner === 'Nhân sự' ? [input.employeeId] : [],
    };
  });
  return { stages, tasks };
}

export function mapStagesByOrder(planStages: { order: number }[], createdStages: StageRef[]): Map<number, string> {
  const sorted = [...createdStages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const result = new Map<number, string>();
  for (const ps of planStages) {
    // Try matching by order value first
    let found = sorted.find((s) => s.order === ps.order);
    // Fallback to position if order value not found
    if (!found) {
      found = sorted[ps.order];
    }
    if (!found) throw new Error(`RUN_STAGE_MISSING:${ps.order}`);
    result.set(ps.order, found._id);
  }
  return result;
}
