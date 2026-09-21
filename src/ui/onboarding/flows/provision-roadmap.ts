// src/ui/onboarding/flows/provision-roadmap.ts
import type { McpApp } from '@privos_ai/app-react';
import { createItem, createList, deleteItem, deleteList, listAllItems, listRoomLists, renameList, updateItem } from '../data/onboarding-lists';
import { ensureHiresList, listTemplateLists, loadListWithFields } from '../data/find-lists';
import { mapWithConcurrency } from '../domain/concurrency';
import { describeError, OnboardingError } from '../domain/errors';
import { F, HIRES_FIELDS, HIRE_STAGES, ROOT_ITEM_NAME, RUN_FIELDS, TEMPLATE_FIELDS, type FieldIds } from '../domain/fields';
import { runKey } from '../domain/keys';
import { isRoomAdmin } from '../domain/roles';
import { buildRoadmapPlan, mapStagesByOrder, type PlannedTask, type RoadmapPlan, type StageRef } from '../domain/roadmap-plan';
import { parseHire, parseRoadmapTask, parseTemplateTask, type Hire } from '../domain/schemas';
import { isWorkingDay } from '../domain/working-days';

export interface ProvisionInput { roomId: string; employeeId: string; templateListId: string; startDate: string; userRoles: readonly string[] }
export interface ProvisionProgress { step: 'preflight' | 'hire' | 'plan' | 'list' | 'items' | 'finish'; done: number; total: number }
export interface ProvisionResult { hireItemId: string; roadmapListId: string; taskCount: number }
type Report = (p: ProvisionProgress) => void;

const PARALLEL = 4;

function stageId(stages: StageRef[], name: string): string {
  const found = stages.find((s) => s.name === name);
  if (!found) throw new OnboardingError('SCHEMA_DRIFT', `stage ${name}`);
  return found._id;
}

async function loadTemplate(app: McpApp, templateListId: string) {
  const tpl = await loadListWithFields(app, templateListId, TEMPLATE_FIELDS);
  const { items } = await listAllItems(app, templateListId);
  const tasks = items.map((i) => parseTemplateTask(i, tpl.ids));
  const bad = tasks.filter((t) => !t.ok);
  if (bad.length) throw new OnboardingError('TEMPLATE_INVALID', `${bad.length} task lỗi`);
  return { ...tpl, tasks: tasks.flatMap((t) => (t.ok ? [t.value] : [])) };
}

async function loadHires(app: McpApp, roomId: string) {
  const hiresList = await ensureHiresList(app, roomId);
  const loaded = await loadListWithFields(app, hiresList._id, HIRES_FIELDS);
  const { items, capped } = await listAllItems(app, hiresList._id);
  return { ...loaded, hires: items.map((i) => parseHire(i, loaded.ids)), capped };
}

/**
 * `runKey` là tất định (userId + startDate). Khi `lists.delete` không dùng
 * được, `cancelProvision` chỉ đổi tên list lộ trình cũ — key cũ vẫn còn nằm
 * trong room. Khởi tạo lại đúng ngày bắt đầu đó sẽ gửi trùng key. Đọc danh
 * sách list của room và thêm hậu tố số tăng dần cho tới khi key chưa dùng.
 * Chỉ dùng lúc tạo — resumeProvision tìm list qua `hire.roadmapListId` chứ
 * không qua key — nên đổi key ở đây an toàn.
 */
async function uniqueRunKey(app: McpApp, roomId: string, wanted: string): Promise<string> {
  const existingKeys = new Set((await listRoomLists(app, roomId)).map((l) => l.key).filter((k): k is string => Boolean(k)));
  if (!existingKeys.has(wanted)) return wanted;
  let n = 2;
  while (existingKeys.has(`${wanted}-${n}`)) n += 1;
  return `${wanted}-${n}`;
}

function taskFields(ids: FieldIds, t: PlannedTask): { fieldId: string; value: unknown }[] {
  return [
    { fieldId: ids[F.dayOffset], value: t.dayOffset },
    { fieldId: ids[F.owner], value: t.owner },
    { fieldId: ids[F.assignee], value: t.assigneeIds },
    { fieldId: ids[F.deadline], value: t.deadline },
    { fieldId: ids[F.done], value: false },
    { fieldId: ids[F.source], value: t.templateTaskId },
  ];
}

async function createMissingTasks(
  app: McpApp, roadmapListId: string, runIds: FieldIds, runStages: StageRef[], plan: RoadmapPlan,
  employeeId: string, startDate: string, report: Report | undefined,
): Promise<{ rootId: string; taskCount: number }> {
  const { items } = await listAllItems(app, roadmapListId);
  const existing = items.map((i) => parseRoadmapTask(i, runIds)).flatMap((r) => (r.ok ? [r.value] : []));
  const stageByOrder = mapStagesByOrder(plan.stages, runStages);
  // Mỗi list lộ trình chỉ có đúng 1 item gốc theo thiết kế, nên `parentId ===
  // null` một mình đã đủ định danh. KHÔNG so thêm tên: nếu ai đó đổi tên item
  // gốc trong tab Lists của Hub, so tên sẽ khiến resume không nhận ra và tạo
  // thêm item gốc thứ hai.
  let root = existing.find((t) => t.parentId === null);
  if (!root) {
    const created = await createItem(app, {
      listId: roadmapListId, name: ROOT_ITEM_NAME, stageId: stageByOrder.get(0) ?? runStages[0]._id,
      // Item gốc kế thừa toàn bộ field bắt buộc của roadmapTaskSchema (qua
      // templateTaskSchema): Hạn (ngày thứ N) và Người thực hiện là required,
      // không chỉ ASSIGNEE/Ngày bắt đầu. Thiếu 2 field này khiến parseRoadmapTask
      // luôn fail cho item gốc, nên resumeProvision không nhận ra nó và tạo
      // item gốc thứ hai, còn loadRoadmap luôn xếp item gốc vào invalid[].
      customFields: [
        { fieldId: runIds[F.assignee], value: [employeeId] },
        { fieldId: runIds[F.startDate], value: startDate },
        { fieldId: runIds[F.dayOffset], value: 0 },
        { fieldId: runIds[F.owner], value: 'HR' },
        { fieldId: runIds[F.done], value: false },
        { fieldId: runIds[F.source], value: '' },
      ],
    });
    root = { id: created._id, name: ROOT_ITEM_NAME, stageId: created.stageId ?? '', parentId: null, dayOffset: 0, owner: 'HR', assigneeIds: [employeeId], deadline: null, done: false, sourceId: null };
  }
  const rootId = root.id;
  const have = new Set(existing.filter((t) => t.parentId !== null).map((t) => t.sourceId));
  const missing = plan.tasks.filter((t) => !have.has(t.templateTaskId));
  let done = plan.tasks.length - missing.length;
  report?.({ step: 'items', done, total: plan.tasks.length });
  await mapWithConcurrency(missing, PARALLEL, async (t) => {
    await createItem(app, { listId: roadmapListId, name: t.name, stageId: stageByOrder.get(t.stageOrder)!, parentId: rootId, customFields: taskFields(runIds, t) });
    done += 1;
    report?.({ step: 'items', done, total: plan.tasks.length });
  });
  return { rootId, taskCount: plan.tasks.length };
}

async function markFailed(app: McpApp, hireItemId: string, hireIds: FieldIds, hireStages: StageRef[], err: unknown): Promise<never> {
  const { code } = describeError(err);
  try {
    await updateItem(app, { itemId: hireItemId, stageId: stageId(hireStages, HIRE_STAGES.failed), customFields: [{ fieldId: hireIds[F.errorCode], value: code }] });
  } catch {
    // Ghi trạng thái lỗi thất bại (Hub sập đúng lúc) — vẫn phải báo lỗi gốc
    // thay vì để exception của updateItem che mất mã lỗi thật sự.
  }
  throw new OnboardingError('PROVISION_FAILED', code);
}

async function finish(app: McpApp, hireItemId: string, hireIds: FieldIds, hireStages: StageRef[], employeeId: string, taskCount: number): Promise<void> {
  await updateItem(app, {
    itemId: hireItemId, stageId: stageId(hireStages, HIRE_STAGES.active),
    customFields: [
      { fieldId: hireIds[F.assignee], value: [employeeId] },
      { fieldId: hireIds[F.doneCount], value: 0 },
      { fieldId: hireIds[F.totalCount], value: taskCount },
      { fieldId: hireIds[F.errorCode], value: '' },
    ],
  });
}

export async function provisionRoadmap(app: McpApp, input: ProvisionInput, onProgress?: Report): Promise<ProvisionResult> {
  onProgress?.({ step: 'preflight', done: 0, total: 1 });
  if (!isRoomAdmin(input.userRoles)) throw new OnboardingError('NOT_ADMIN');
  if (!isWorkingDay(input.startDate)) throw new OnboardingError('START_NOT_WORKING_DAY');
  const template = await loadTemplate(app, input.templateListId);
  const hires = await loadHires(app, input.roomId);
  // List `onb-hires` chỉ tăng, không bao giờ xóa hồ sơ đã Hoàn tất. Khi vượt
  // 500 item và thiếu scope `lists:query`, listAllItems dùng đường dự phòng
  // bị cắt còn 500 item — preflight chống trùng phía dưới sẽ không thấy được
  // hồ sơ cũ nằm ngoài lát cắt đó. Thà từ chối còn hơn âm thầm tạo hồ sơ +
  // list lộ trình trùng.
  if (hires.capped) throw new OnboardingError('SCHEMA_DRIFT', 'danh sách hồ sơ bị giới hạn 500, không kiểm tra trùng được');
  // ASSIGNEE chỉ được gán ở bước cuối (finish()), nên một hồ sơ chưa chạy tới
  // đó — kể cả hồ sơ vừa bị markFailed đẩy sang "Khởi tạo lỗi" — luôn có
  // employeeIds = []. Phải so thêm `name` (được ghi = employeeId ngay lúc tạo
  // hồ sơ) để nhận diện đúng nhân sự và chặn khởi tạo trùng.
  const running = hires.hires.some((h) => h.ok && (h.value.employeeIds.includes(input.employeeId) || h.value.name === input.employeeId) && h.value.stageId !== stageId(hires.stages, HIRE_STAGES.completed));
  if (running) throw new OnboardingError('HIRE_EXISTS');

  onProgress?.({ step: 'hire', done: 0, total: 1 });
  const hireItem = await createItem(app, {
    listId: hires.list._id, name: input.employeeId, stageId: stageId(hires.stages, HIRE_STAGES.provisioning),
    customFields: [
      { fieldId: hires.ids[F.position], value: template.list.name },
      { fieldId: hires.ids[F.startDate], value: input.startDate },
    ],
  });

  try {
    onProgress?.({ step: 'plan', done: 0, total: 1 });
    const plan = buildRoadmapPlan({ templateStages: template.stages, templateTasks: template.tasks, startDate: input.startDate, employeeId: input.employeeId });
    // Template có 0 task → taskCount = 0 → finish() vẫn đẩy hồ sơ sang "Đang
    // onboarding" với 0/0, mà recountHire coi 0/0 KHÔNG BAO GIỜ là hoàn tất.
    // Chặn ở đây, trước khi tạo list lộ trình, để hồ sơ đi thẳng vào "Khởi
    // tạo lỗi" (đã có nút Tiếp tục/Hủy) thay vào ngõ cụt "Đang onboarding".
    if (plan.tasks.length === 0) throw new OnboardingError('TEMPLATE_INVALID', 'template chưa có task nào');

    onProgress?.({ step: 'list', done: 0, total: 1 });
    const runKeyWanted = runKey(input.employeeId, input.startDate);
    const runList = await createList(app, {
      roomId: input.roomId, name: `Lộ trình · ${input.employeeId} · ${template.list.name}`,
      key: await uniqueRunKey(app, input.roomId, runKeyWanted), isolated: true, fields: RUN_FIELDS, stages: plan.stages,
    });
    await updateItem(app, { itemId: hireItem._id, customFields: [{ fieldId: hires.ids[F.roadmapListId], value: runList._id }] });
    const run = await loadListWithFields(app, runList._id, RUN_FIELDS);

    const { taskCount } = await createMissingTasks(app, runList._id, run.ids, run.stages, plan, input.employeeId, input.startDate, onProgress);

    onProgress?.({ step: 'finish', done: 0, total: 1 });
    await finish(app, hireItem._id, hires.ids, hires.stages, input.employeeId, taskCount);
    return { hireItemId: hireItem._id, roadmapListId: runList._id, taskCount };
  } catch (err) {
    return markFailed(app, hireItem._id, hires.ids, hires.stages, err);
  }
}

async function findHire(app: McpApp, roomId: string, hireItemId: string) {
  const hires = await loadHires(app, roomId);
  const found = hires.hires.find((h) => h.ok && h.value.id === hireItemId);
  if (!found || !found.ok) throw new OnboardingError('SCHEMA_DRIFT', 'hire not found');
  return { ...hires, hire: found.value as Hire };
}

export async function resumeProvision(app: McpApp, input: { roomId: string; hireItemId: string; userRoles: readonly string[] }, onProgress?: Report): Promise<ProvisionResult> {
  if (!isRoomAdmin(input.userRoles)) throw new OnboardingError('NOT_ADMIN');
  const hires = await findHire(app, input.roomId, input.hireItemId);
  const hire = hires.hire;
  if (!hire.roadmapListId) throw new OnboardingError('PROVISION_FAILED', 'no roadmap list; cancel and retry');
  try {
    const run = await loadListWithFields(app, hire.roadmapListId, RUN_FIELDS);
    // Template gốc: tìm lại theo tên vị trí đã lưu trên hồ sơ.
    const tplList = (await listTemplateLists(app, input.roomId)).find((l) => l.name === hire.position);
    if (!tplList) throw new OnboardingError('TEMPLATE_INVALID', 'template list not found');
    const template = await loadTemplate(app, tplList._id);
    // ASSIGNEE chỉ được gán ở bước cuối, nên khi resume lấy user id từ tên item hồ sơ.
    const employeeId = hire.employeeIds[0] ?? hire.name;
    const plan = buildRoadmapPlan({ templateStages: template.stages, templateTasks: template.tasks, startDate: hire.startDate, employeeId });
    if (plan.tasks.length === 0) throw new OnboardingError('TEMPLATE_INVALID', 'template chưa có task nào');
    const { taskCount } = await createMissingTasks(app, hire.roadmapListId, run.ids, run.stages, plan, employeeId, hire.startDate, onProgress);
    onProgress?.({ step: 'finish', done: 0, total: 1 });
    await finish(app, hire.id, hires.ids, hires.stages, employeeId, taskCount);
    return { hireItemId: hire.id, roadmapListId: hire.roadmapListId, taskCount };
  } catch (err) {
    return markFailed(app, hire.id, hires.ids, hires.stages, err);
  }
}

export async function cancelProvision(app: McpApp, input: { roomId: string; hireItemId: string; userRoles: readonly string[] }): Promise<void> {
  if (!isRoomAdmin(input.userRoles)) throw new OnboardingError('NOT_ADMIN');
  const hires = await findHire(app, input.roomId, input.hireItemId);
  const listId = hires.hire.roadmapListId;
  if (listId) {
    const deleted = await deleteList(app, listId);
    if (!deleted) await renameList(app, listId, `(Đã hủy) ${listId}`);
  }
  await deleteItem(app, hires.hire.id);
}
