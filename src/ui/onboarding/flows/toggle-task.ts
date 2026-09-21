// src/ui/onboarding/flows/toggle-task.ts
import type { McpApp } from '@privos_ai/app-react';
import { listAllItems, updateItem } from '../data/onboarding-lists';
import { OnboardingError } from '../domain/errors';
import { F, HIRE_STAGES, type FieldIds } from '../domain/fields';
import { computeProgress, type Progress } from '../domain/progress';
import type { StageRef } from '../domain/roadmap-plan';
import { parseRoadmapTask } from '../domain/schemas';

export interface RecountInput {
  hireListId: string; hireItemId: string; hireIds: FieldIds; hireStages: StageRef[];
  roadmapListId: string; runIds: FieldIds; today: string;
  /**
   * Stage hiện tại của hồ sơ TRƯỚC khi đếm lại (do caller truyền vào, recountHire
   * không tự đọc hồ sơ). Dùng để KHÔNG kéo hồ sơ ra khỏi "Khởi tạo lỗi" một cách
   * âm thầm khi ai đó tick task trong lúc lỗi khởi tạo chưa được xử lý qua luồng
   * Tiếp tục/Hủy. Bỏ trống thì giữ hành vi cũ (tự chuyển Đang onboarding/Hoàn tất).
   */
  currentStageId?: string;
}

// Đọc lại toàn bộ task của lộ trình và tính tiến độ tuyệt đối. Nếu list có item
// nhưng KHÔNG parse được task nào (mọi item đều lỗi), coi như runIds không khớp
// list lộ trình (ids cũ hoặc của list khác) — ném lỗi TRƯỚC khi ghi bất cứ gì
// lên hồ sơ, tránh âm thầm ghi đè 0/0 lên một hồ sơ có thể đang đúng.
async function fetchProgress(app: McpApp, input: RecountInput): Promise<Progress> {
  const { items } = await listAllItems(app, input.roadmapListId);
  const tasks = items.map((i) => parseRoadmapTask(i, input.runIds)).flatMap((r) => (r.ok ? [r.value] : []));
  if (items.length > 0 && tasks.length === 0) {
    throw new OnboardingError('SCHEMA_DRIFT', 'runIds không khớp list lộ trình');
  }
  return computeProgress(tasks, input.today);
}

function resolveStagePatch(input: RecountInput, progress: Progress): { stageId?: string } {
  const failedStage = input.hireStages.find((s) => s.name === HIRE_STAGES.failed)?._id;
  // Hồ sơ đang ở "Khởi tạo lỗi": không để một lượt tick task âm thầm "chữa" lỗi
  // khởi tạo. Chỉ ghi số đếm, giữ nguyên stage — lỗi phải qua luồng Tiếp tục/Hủy.
  if (input.currentStageId && failedStage && input.currentStageId === failedStage) return {};
  const complete = progress.total > 0 && progress.done === progress.total;
  const completedStage = input.hireStages.find((s) => s.name === HIRE_STAGES.completed)?._id;
  const activeStage = input.hireStages.find((s) => s.name === HIRE_STAGES.active)?._id;
  if (complete && completedStage) return { stageId: completedStage };
  if (!complete && activeStage) return { stageId: activeStage };
  return {};
}

// Ghi tiến độ tuyệt đối (+ stage phù hợp) lên hồ sơ. Dùng lại cho cả lần ghi
// đầu tiên lẫn lần ghi xác nhận, tránh chép đôi logic ghi.
async function writeProgress(app: McpApp, input: RecountInput, progress: Progress): Promise<void> {
  await updateItem(app, {
    itemId: input.hireItemId,
    ...resolveStagePatch(input, progress),
    customFields: [
      { fieldId: input.hireIds[F.doneCount], value: progress.done },
      { fieldId: input.hireIds[F.totalCount], value: progress.total },
    ],
  });
}

/**
 * Đếm lại tuyệt đối tiến độ lộ trình rồi ghi hồ sơ.
 *
 * Đếm tuyệt đối (đọc lại toàn bộ task, ghi số tuyệt đối thay vì cộng/trừ) chỉ
 * chữa lost-update kiểu cộng dồn — nó KHÔNG chữa được kiểu "đọc cũ, ghi đè":
 * A đọc xong trước khi B ghi kịp (A thấy 1/2), B ghi xong và ghi hồ sơ đúng
 * 2/2, rồi A dùng dữ liệu đã cũ ghi đè hồ sơ về 1/2. Vì `updateItem` không có
 * compare-and-swap, cách chữa ở đây là thêm ĐÚNG MỘT vòng đọc xác nhận: sau khi
 * ghi lần một, đọc lại toàn bộ task lần hai; nếu kết quả khác lần một (do có
 * người khác vừa ghi xong trong lúc ta đang xử lý), ghi đè lại bằng kết quả lần
 * hai rồi trả về kết quả đó. Tối đa 2 lần đọc, 2 lần ghi mỗi lời gọi — không có
 * vòng lặp while/retry vô hạn.
 */
export async function recountHire(app: McpApp, input: RecountInput): Promise<Progress> {
  const first = await fetchProgress(app, input);
  await writeProgress(app, input, first);
  const second = await fetchProgress(app, input);
  if (second.done !== first.done || second.total !== first.total) {
    await writeProgress(app, input, second);
    return second;
  }
  return first;
}

export async function toggleTask(app: McpApp, input: RecountInput & { taskId: string; done: boolean }): Promise<Progress> {
  await updateItem(app, { itemId: input.taskId, customFields: [{ fieldId: input.runIds[F.done], value: input.done }] });
  return recountHire(app, input);
}
