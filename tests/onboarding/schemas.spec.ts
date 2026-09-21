// tests/onboarding/schemas.spec.ts
import { describe, expect, it } from 'vitest';
import { F, HIRES_FIELDS, resolveFieldIds, fieldValue, type FieldDef, type HubItem } from '../../src/ui/onboarding/domain/fields';
import { parseHire, parseRoadmapTask, parseTemplateTask } from '../../src/ui/onboarding/domain/schemas';

const defs: FieldDef[] = HIRES_FIELDS.map((s, i) => ({ _id: `f${i}`, name: s.name, type: s.type }));
const okIds = resolveFieldIds(defs, HIRES_FIELDS);

describe('resolveFieldIds', () => {
  it('map tên field sang _id', () => {
    expect(okIds.ok).toBe(true);
    if (okIds.ok) expect(okIds.ids[F.position]).toBe(defs.find((d) => d.name === F.position)!._id);
  });
  it('báo tên field thiếu', () => {
    const res = resolveFieldIds(defs.slice(1), HIRES_FIELDS);
    expect(res).toEqual({ ok: false, missing: [defs[0].name] });
  });
});

describe('fieldValue', () => {
  it('trả undefined khi không có field', () => {
    expect(fieldValue({ _id: 'i1' }, 'x')).toBeUndefined();
    expect(fieldValue({ _id: 'i1', customFields: [{ fieldId: 'x', value: 3 }] }, 'x')).toBe(3);
  });
});

describe('parseHire', () => {
  if (!okIds.ok) throw new Error('fixture');
  const ids = okIds.ids;
  const item: HubItem = {
    _id: 'h1', stageId: 's1',
    customFields: [
      { fieldId: ids[F.assignee], value: [{ _id: 'u1' }] },
      { fieldId: ids[F.roadmapListId], value: 'L9' },
      { fieldId: ids[F.position], value: 'Backend' },
      { fieldId: ids[F.startDate], value: '2026-09-21' },
      { fieldId: ids[F.doneCount], value: 2 },
      { fieldId: ids[F.totalCount], value: 5 },
    ],
  };
  it('parse item hợp lệ', () => {
    expect(parseHire(item, ids)).toEqual({ ok: true, value: {
      id: 'h1', name: '', stageId: 's1', employeeIds: ['u1'], roadmapListId: 'L9', position: 'Backend',
      startDate: '2026-09-21', doneCount: 2, totalCount: 5, errorCode: null,
    } });
  });
  it('field đếm thiếu thì mặc định 0, roadmap thiếu thì null', () => {
    const r = parseHire({ _id: 'h2', stageId: 's1', customFields: [{ fieldId: ids[F.position], value: 'QA' }, { fieldId: ids[F.startDate], value: '2026-09-21' }] }, ids);
    expect(r.ok && r.value.doneCount).toBe(0);
    expect(r.ok && r.value.roadmapListId).toBe(null);
  });
  it('sai kiểu thì báo lỗi kèm itemId', () => {
    const r = parseHire({ _id: 'h3', stageId: 's1', customFields: [{ fieldId: ids[F.startDate], value: 'hôm qua' }] }, ids);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.itemId).toBe('h3'); expect(r.issues.length).toBeGreaterThan(0); }
  });
  it('startDate là ngày phi lịch (tháng/ngày không hợp lệ) thì báo lỗi', () => {
    const r = parseHire({ _id: 'h4', stageId: 's1', customFields: [{ fieldId: ids[F.position], value: 'QA' }, { fieldId: ids[F.startDate], value: '2026-13-45' }] }, ids);
    expect(r.ok).toBe(false);
  });
  it('startDate dạng timestamp ISO đầy đủ (Hub chuẩn hóa DATE) vẫn parse được, cắt về YYYY-MM-DD', () => {
    const r = parseHire({ _id: 'h5', stageId: 's1', customFields: [{ fieldId: ids[F.position], value: 'QA' }, { fieldId: ids[F.startDate], value: '2026-09-25T00:00:00.000Z' }] }, ids);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.startDate).toBe('2026-09-25');
  });
  it('startDate là chuỗi rác (không phải timestamp ISO hợp lệ) vẫn bị từ chối', () => {
    const r = parseHire({ _id: 'h6', stageId: 's1', customFields: [{ fieldId: ids[F.position], value: 'QA' }, { fieldId: ids[F.startDate], value: 'không phải ngày' }] }, ids);
    expect(r.ok).toBe(false);
  });
});

describe('parseTemplateTask / parseRoadmapTask', () => {
  const tIds = { [F.dayOffset]: 'd', [F.owner]: 'o' };
  it('template task', () => {
    expect(parseTemplateTask({ _id: 't1', name: 'Nhận laptop', stageId: 's1', customFields: [{ fieldId: 'd', value: 1 }, { fieldId: 'o', value: 'HR' }] }, tIds))
      .toEqual({ ok: true, value: { id: 't1', name: 'Nhận laptop', stageId: 's1', dayOffset: 1, owner: 'HR' } });
  });
  it('template task owner lạ thì lỗi', () => {
    expect(parseTemplateTask({ _id: 't2', name: 'x', stageId: 's1', customFields: [{ fieldId: 'd', value: 1 }, { fieldId: 'o', value: 'Sếp' }] }, tIds).ok).toBe(false);
  });
  it('roadmap task', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r1', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'ok', value: true }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r).toEqual({ ok: true, value: { id: 'r1', name: 'Ký NDA', stageId: 's2', parentId: 'root', dayOffset: 0, owner: 'Nhân sự', assigneeIds: ['u1'], deadline: '2026-09-21', done: true, sourceId: 't1' } });
  });
  it('roadmap task deadline không có trên lịch (2026 không nhuận) thì lỗi', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r2', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-02-29' }, { fieldId: 'ok', value: true }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok).toBe(false);
  });
  it('roadmap task Hoàn thành = 1 (số) thì done true', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r3', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'ok', value: 1 }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok && r.value.done).toBe(true);
  });
  it('roadmap task Hoàn thành = "1" (chuỗi) thì done true', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r4', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'ok', value: '1' }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok && r.value.done).toBe(true);
  });
  it('roadmap task Hoàn thành = 0 thì done false', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r5', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'ok', value: 0 }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok && r.value.done).toBe(false);
  });
  it('roadmap task Hoàn thành = "false" thì done false', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r6', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'ok', value: 'false' }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok && r.value.done).toBe(false);
  });
  it('roadmap task thiếu field Hoàn thành thì done false', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r7', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok && r.value.done).toBe(false);
  });
  it('parseRoadmapTask với parentId: "" (chuỗi rỗng) thì normalize thành null', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r8', name: 'Ký NDA', stageId: 's2', parentId: '', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'ok', value: false }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok && r.value.parentId).toBe(null);
  });
  it('parseRoadmapTask với parentId: "   " (chỉ khoảng trắng) thì normalize thành null', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r9', name: 'Ký NDA', stageId: 's2', parentId: '   ', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'ok', value: false }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok && r.value.parentId).toBe(null);
  });
  it('parseRoadmapTask với parentId: "root" (giá trị hợp lệ) thì không bị đổi', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r10', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-21' }, { fieldId: 'ok', value: false }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok && r.value.parentId).toBe('root');
  });
  it('roadmap task deadline dạng timestamp ISO đầy đủ (Hub chuẩn hóa DEADLINE) vẫn parse được, cắt về YYYY-MM-DD', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r11', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: '2026-09-25T00:00:00.000Z' }, { fieldId: 'ok', value: false }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.deadline).toBe('2026-09-25');
  });
  it('roadmap task deadline là chuỗi rác thì vẫn bị từ chối', () => {
    const rIds = { ...tIds, [F.assignee]: 'a', [F.deadline]: 'dl', [F.done]: 'ok', [F.source]: 'src' };
    const r = parseRoadmapTask({ _id: 'r12', name: 'Ký NDA', stageId: 's2', parentId: 'root', customFields: [
      { fieldId: 'd', value: 0 }, { fieldId: 'o', value: 'Nhân sự' }, { fieldId: 'a', value: ['u1'] },
      { fieldId: 'dl', value: 'không phải ngày' }, { fieldId: 'ok', value: false }, { fieldId: 'src', value: 't1' },
    ] }, rIds);
    expect(r.ok).toBe(false);
  });
});
