// tests/onboarding/toggle-task.spec.ts
import type { McpApp, RestRequestParams, RestResponse } from '@privos_ai/app-react';
import { describe, expect, it } from 'vitest';
import { F, HIRES_FIELDS, RUN_FIELDS } from '../../src/ui/onboarding/domain/fields';
import { toggleTask } from '../../src/ui/onboarding/flows/toggle-task';
import { fakeRestApp, ok, type FakeRoute } from './fake-app';

// Bọc app giả bằng một app có "độ trễ mạng" thật (setTimeout), để Promise.all
// tái tạo đúng interleaving bất đồng bộ giữa hai lượt tick song song thay vì
// chạy đồng bộ tức thời như fakeRestApp gốc.
function delayedApp(inner: McpApp, delayFor: (path: string) => number): McpApp {
  const innerRest = (inner as unknown as { rest: (req: RestRequestParams) => Promise<RestResponse> }).rest;
  const rest = async (req: RestRequestParams): Promise<RestResponse> => {
    const ms = delayFor(req.path);
    if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms));
    return innerRest(req);
  };
  return { rest, callServerTool: inner.callServerTool.bind(inner) } as unknown as McpApp;
}

function fixture() {
  const runIds = Object.fromEntries(RUN_FIELDS.map((s, i) => [s.name, `r${i}`]));
  const hireIds = Object.fromEntries(HIRES_FIELDS.map((s, i) => [s.name, `h${i}`]));
  const hireStages = ['Đang khởi tạo', 'Đang onboarding', 'Hoàn tất', 'Khởi tạo lỗi'].map((name, order) => ({ _id: `HS${order}`, name, order }));
  const task = (id: string, done: boolean) => ({ _id: id, name: id, stageId: 'S0', parentId: 'root', customFields: [
    { fieldId: runIds[F.dayOffset], value: 0 }, { fieldId: runIds[F.owner], value: 'Nhân sự' }, { fieldId: runIds[F.assignee], value: ['u1'] },
    { fieldId: runIds[F.deadline], value: '2026-09-21' }, { fieldId: runIds[F.done], value: done }, { fieldId: runIds[F.source], value: `src-${id}` } ] });
  const items: Record<string, unknown>[] = [{ _id: 'root', name: 'Tổng quan', stageId: 'S0', parentId: null, customFields: [] }, task('a', false), task('b', false)];
  const hire: Record<string, unknown> = { _id: 'H1', stageId: 'HS1', customFields: [] };
  const routes: FakeRoute[] = [
    { method: 'GET', path: 'items.get', reply: (req) => ok({ item: req.query?.itemId === 'H1'
      ? hire : items.find((entry) => entry._id === req.query?.itemId) }) },
    { method: 'POST', path: 'items.update', reply: (req) => {
      if (req.body.itemId === 'H1') { hire.customFields = req.body.customFields ?? hire.customFields; if (req.body.stageId) hire.stageId = req.body.stageId; return ok({}); }
      const it = items.find((i) => i._id === req.body.itemId) as { customFields: { fieldId: string; value: unknown }[] };
      for (const n of req.body.customFields) { const c = it.customFields.find((x) => x.fieldId === n.fieldId); if (c) c.value = n.value; }
      return ok({});
    } },
    { method: 'POST', path: 'items.query', reply: () => ok({ items: JSON.parse(JSON.stringify(items)), nextCursor: null }) },
  ];
  const { app, calls } = fakeRestApp(routes);
  const base = { hireListId: 'H', hireItemId: 'H1', hireIds, hireStages, roadmapListId: 'RUN', runIds, today: '2026-09-21' };
  const hireCount = (name: string) => (hire.customFields as { fieldId: string; value: unknown }[]).find((c) => c.fieldId === hireIds[name])?.value;
  return { app, calls, base, hire, hireCount };
}

describe('toggleTask', () => {
  it('ghi Hoàn thành, đếm lại tuyệt đối và cập nhật hồ sơ', async () => {
    const f = fixture();
    const p = await toggleTask(f.app, { ...f.base, taskId: 'a', done: true });
    expect(p).toMatchObject({ done: 1, total: 2, percent: 50 });
    expect(f.hireCount(F.doneCount)).toBe(1);
    expect(f.hireCount(F.totalCount)).toBe(2);
    expect(f.hire.stageId).toBe('HS1');
  });

  it('xong hết thì hồ sơ sang Hoàn tất', async () => {
    const f = fixture();
    await toggleTask(f.app, { ...f.base, taskId: 'a', done: true });
    await toggleTask(f.app, { ...f.base, taskId: 'b', done: true });
    expect(f.hire.stageId).toBe('HS2');
  });

  it('hai lần tick đồng thời (có độ trễ mạng thật) vẫn ra số đếm đúng nhờ đọc xác nhận lần hai', async () => {
    const f = fixture();
    // items.query (đọc toàn bộ task) chậm hơn items.update (ghi task/hồ sơ):
    // tái tạo ca "A đọc trước khi B ghi xong" — nếu recountHire chỉ đọc một lần,
    // lần ghi hồ sơ cuối cùng có thể mang dữ liệu cũ; vòng đọc xác nhận thứ hai
    // phải tự sửa lại đúng 2/2.
    const app = delayedApp(f.app, (path) => (path === 'items.query' ? 20 : 0));
    await Promise.all([
      toggleTask(app, { ...f.base, taskId: 'a', done: true }),
      toggleTask(app, { ...f.base, taskId: 'b', done: true }),
    ]);
    expect(f.hireCount(F.doneCount)).toBe(2);
    expect(f.hireCount(F.totalCount)).toBe(2);
    expect(f.hire.stageId).toBe('HS2');
  });

  it('giữ nguyên "Khởi tạo lỗi", chỉ cập nhật số đếm, khi hồ sơ đang ở stage lỗi', async () => {
    const f = fixture();
    f.hire.stageId = 'HS3'; // Khởi tạo lỗi
    const p = await toggleTask(f.app, { ...f.base, taskId: 'a', done: true, currentStageId: 'HS3' });
    expect(p).toMatchObject({ done: 1, total: 2 });
    expect(f.hireCount(F.doneCount)).toBe(1);
    expect(f.hireCount(F.totalCount)).toBe(2);
    expect(f.hire.stageId).toBe('HS3');
  });

  it('runIds không khớp list lộ trình thì ném SCHEMA_DRIFT và không ghi gì lên hồ sơ', async () => {
    const f = fixture();
    f.hire.customFields = [
      { fieldId: f.base.hireIds[F.doneCount], value: 0 },
      { fieldId: f.base.hireIds[F.totalCount], value: 0 },
    ];
    const badRunIds = Object.fromEntries(RUN_FIELDS.map((s, i) => [s.name, `bad-${i}`]));
    await expect(toggleTask(f.app, { ...f.base, runIds: badRunIds, taskId: 'a', done: true })).rejects.toThrow('SCHEMA_DRIFT');
    expect(f.hireCount(F.doneCount)).toBe(0);
    expect(f.hireCount(F.totalCount)).toBe(0);
  });

  // Test tất định (dùng callIndex của fake route để ép lần đọc đầu trả dữ liệu
  // cũ, lần đọc sau trả dữ liệu mới) chứng minh vòng xác nhận là CẦN THIẾT, chứ
  // không chỉ là test hồi quy như test "có độ trễ mạng thật" ở trên. Test này
  // FAIL nếu recountHire chỉ đọc một lần (round 0, không có vòng xác nhận) và
  // PASS với recountHire có vòng xác nhận đọc lại lần hai (round 1) — đã tự
  // kiểm chứng cả hai chiều, xem mục "Fix round 2" trong task-11-report.md.
  it('vòng xác nhận sửa lại số đếm khi lần đọc đầu thấy dữ liệu cũ', async () => {
    const runIds = Object.fromEntries(RUN_FIELDS.map((s, i) => [s.name, `r${i}`]));
    const hireIds = Object.fromEntries(HIRES_FIELDS.map((s, i) => [s.name, `h${i}`]));
    const hireStages = ['Đang khởi tạo', 'Đang onboarding', 'Hoàn tất', 'Khởi tạo lỗi'].map((name, order) => ({ _id: `HS${order}`, name, order }));
    const task = (id: string, done: boolean) => ({ _id: id, name: id, stageId: 'S0', parentId: 'root', customFields: [
      { fieldId: runIds[F.dayOffset], value: 0 }, { fieldId: runIds[F.owner], value: 'Nhân sự' }, { fieldId: runIds[F.assignee], value: ['u1'] },
      { fieldId: runIds[F.deadline], value: '2026-09-21' }, { fieldId: runIds[F.done], value: done }, { fieldId: runIds[F.source], value: `src-${id}` } ] });
    const root = { _id: 'root', name: 'Tổng quan', stageId: 'S0', parentId: null, customFields: [] };
    const staleItems = [root, task('a', true), task('b', false)]; // lần đọc đầu: chỉ a xong — 1/2, mô phỏng B chưa kịp ghi
    const freshItems = [root, task('a', true), task('b', true)]; // lần đọc sau: cả hai đã xong — 2/2, mô phỏng B đã ghi xong
    const hire: Record<string, unknown> = { _id: 'H1', stageId: 'HS1', customFields: [] };
    const routes: FakeRoute[] = [
      { method: 'GET', path: 'items.get', reply: (req) => ok({ item: req.query?.itemId === 'H1'
        ? hire : freshItems.find((entry) => entry._id === req.query?.itemId) }) },
      { method: 'POST', path: 'items.update', reply: (req) => {
        if (req.body.itemId === 'H1') { hire.customFields = req.body.customFields ?? hire.customFields; if (req.body.stageId) hire.stageId = req.body.stageId; }
        return ok({});
      } },
      { method: 'POST', path: 'items.query', reply: (_req, callIndex) => ok({ items: JSON.parse(JSON.stringify(callIndex === 0 ? staleItems : freshItems)), nextCursor: null }) },
    ];
    const { app } = fakeRestApp(routes);
    const base = { hireListId: 'H', hireItemId: 'H1', hireIds, hireStages, roadmapListId: 'RUN', runIds, today: '2026-09-21' };
    const hireCount = (name: string) => (hire.customFields as { fieldId: string; value: unknown }[]).find((c) => c.fieldId === hireIds[name])?.value;

    const p = await toggleTask(app, { ...base, taskId: 'a', done: true });

    expect(p).toMatchObject({ done: 2, total: 2 }); // (1) trả kết quả của lần đọc thứ hai, không phải lần đầu
    expect(hireCount(F.doneCount)).toBe(2); // (2) lần ghi thứ hai đè lên giá trị cũ 1/2
    expect(hireCount(F.totalCount)).toBe(2);
    expect(hire.stageId).toBe('HS2'); // (3) vòng xác nhận sửa lại cả stage, không chỉ số đếm
  });
});
