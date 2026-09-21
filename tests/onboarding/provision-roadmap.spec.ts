// tests/onboarding/provision-roadmap.spec.ts
import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../../src/ui/onboarding/domain/concurrency';
import { F, HIRES_FIELDS, RUN_FIELDS, TEMPLATE_FIELDS } from '../../src/ui/onboarding/domain/fields';
import { runKey } from '../../src/ui/onboarding/domain/keys';
import { parseRoadmapTask } from '../../src/ui/onboarding/domain/schemas';
import { cancelProvision, provisionRoadmap, resumeProvision } from '../../src/ui/onboarding/flows/provision-roadmap';
import { fakeRestApp, forbidden, ok, type FakeRoute } from './fake-app';

describe('mapWithConcurrency', () => {
  it('không vượt giới hạn và giữ thứ tự kết quả', async () => {
    let active = 0; let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1; return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
  });

  it('dừng sớm khi một fn lỗi, không tiếp tục gọi hết các phần tử còn lại', async () => {
    let calls = 0;
    await expect(mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      calls += 1;
      if (n === 2) throw new Error('boom-worker');
      await new Promise((r) => setTimeout(r, 5));
      return n * 10;
    })).rejects.toThrow('boom-worker');
    expect(calls).toBeLessThan(6);
  });
});

/** Hub giả lập trong bộ nhớ: đủ để chạy provision từ đầu tới cuối. */
function hubFixture(opts: { failItemAt?: number; persistThenFailItemAt?: number; failUpdateFrom?: number; cappedListId?: string; extraLists?: { _id: string; name: string; key: string }[] } = {}) {
  const defs = (specs: { name: string; type: string }[], prefix: string) => specs.map((s, i) => ({ _id: `${prefix}${i}`, name: s.name, type: s.type }));
  const tplIds = Object.fromEntries(TEMPLATE_FIELDS.map((s, i) => [s.name, `t${i}`]));
  const hireIds = Object.fromEntries(HIRES_FIELDS.map((s, i) => [s.name, `h${i}`]));
  const runIds = Object.fromEntries(RUN_FIELDS.map((s, i) => [s.name, `r${i}`]));
  const lists = [
    { _id: 'H', name: 'Onboarding · Nhân sự', key: 'onb-hires', fieldDefinitions: defs(HIRES_FIELDS, 'h') },
    { _id: 'T', name: 'Backend', key: 'onb-tpl-backend', fieldDefinitions: defs(TEMPLATE_FIELDS, 't') },
    { _id: 'TE', name: 'Empty', key: 'onb-tpl-empty', fieldDefinitions: defs(TEMPLATE_FIELDS, 't') },
    ...(opts.extraLists ?? []),
  ];
  const stagesByList: Record<string, { _id: string; name: string; order: number }[]> = {
    H: ['Đang khởi tạo', 'Đang onboarding', 'Hoàn tất', 'Khởi tạo lỗi'].map((name, order) => ({ _id: `HS${order}`, name, order })),
    T: [{ _id: 'TS0', name: 'Ngày đầu', order: 0 }, { _id: 'TS1', name: 'Tuần 1', order: 1 }],
    TE: [{ _id: 'TES0', name: 'Ngày đầu', order: 0 }],
  };
  const items: Record<string, Record<string, unknown>[]> = {
    H: [],
    T: [
      { _id: 'tt1', name: 'Ký NDA', stageId: 'TS0', customFields: [{ fieldId: tplIds[F.dayOffset], value: 0 }, { fieldId: tplIds[F.owner], value: 'Nhân sự' }] },
      { _id: 'tt2', name: 'Cấp laptop', stageId: 'TS0', customFields: [{ fieldId: tplIds[F.dayOffset], value: 1 }, { fieldId: tplIds[F.owner], value: 'HR' }] },
      { _id: 'tt3', name: 'Gặp team', stageId: 'TS1', customFields: [{ fieldId: tplIds[F.dayOffset], value: 5 }, { fieldId: tplIds[F.owner], value: 'Nhân sự' }] },
    ],
    TE: [],
  };
  let seq = 0;
  let created = 0;
  const routes: FakeRoute[] = [
    { method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists }) },
    { method: 'GET', path: 'lists.info', reply: (req) => { const id = String(req.query?.listId); return ok({ list: lists.find((l) => l._id === id), stages: stagesByList[id] ?? [] }); } },
    { method: 'POST', path: 'lists.create', reply: (req) => {
      const id = `RUN${++seq}`;
      const list = { _id: id, name: req.body.name, key: req.body.key, fieldDefinitions: defs(RUN_FIELDS, 'r') };
      lists.push(list);
      stagesByList[id] = req.body.stages.map((s: { name: string; order: number }, i: number) => ({ _id: `${id}S${i}`, name: s.name, order: s.order }));
      items[id] = [];
      return ok({ list });
    } },
    { method: 'POST', path: 'items.create', reply: (req) => {
      created += 1;
      if (opts.failItemAt !== undefined && created === opts.failItemAt) return { statusCode: 500, body: { success: false, error: 'boom' } };
      const item = { _id: `I${++seq}`, name: req.body.name, stageId: req.body.stageId, parentId: req.body.parentId ?? null, customFields: req.body.customFields ?? [] };
      items[req.body.listId].push(item);
      if (opts.persistThenFailItemAt !== undefined && created === opts.persistThenFailItemAt) {
        // Hub đã ghi item xong (nó đã nằm trong store) nhưng response bị mất —
        // khác hẳn failItemAt, nơi item CHƯA TỪNG được ghi. Đây là kịch bản
        // "ghi thành công nhưng mất response" mà việc không có transaction
        // buộc resume phải xử lý đúng (dedup theo Nguồn, không tạo trùng).
        return { statusCode: 500, body: { success: false, error: 'boom-lost-response' } };
      }
      return ok({ item });
    } },
    { method: 'POST', path: 'items.update', reply: (req, callIndex) => {
      if (opts.failUpdateFrom !== undefined && callIndex + 1 >= opts.failUpdateFrom) {
        return { statusCode: 500, body: { success: false, error: 'update-boom' } };
      }
      for (const arr of Object.values(items)) {
        const it = arr.find((i) => i._id === req.body.itemId);
        if (it) {
          if (req.body.stageId) it.stageId = req.body.stageId;
          if (req.body.customFields) {
            const cf = (it.customFields as { fieldId: string; value: unknown }[]).filter((c) => !req.body.customFields.some((n: { fieldId: string }) => n.fieldId === c.fieldId));
            it.customFields = [...cf, ...req.body.customFields];
          }
        }
      }
      return ok({});
    } },
    { method: 'POST', path: 'items.query', reply: (req) => {
      // `capped`: thiếu scope lists:query buộc listAllItems rơi vào đường dự
      // phòng items.listByListId, bị giới hạn 500 item.
      if (opts.cappedListId !== undefined && req.body.listId === opts.cappedListId) return forbidden();
      return ok({ items: items[req.body.listId] ?? [], nextCursor: null });
    } },
    { method: 'GET', path: 'items.listByListId', reply: (req) => ok({ items: items[String(req.query?.listId)] ?? [], truncated: opts.cappedListId !== undefined && req.query?.listId === opts.cappedListId }) },
    { method: 'POST', path: 'items.delete', reply: (req) => { for (const k of Object.keys(items)) items[k] = items[k].filter((i) => i._id !== req.body.itemId); return ok({}); } },
    { method: 'POST', path: 'lists.delete', reply: (req) => { delete items[req.body.listId]; return ok({}); } },
  ];
  const fake = fakeRestApp(routes);
  const hireField = (item: Record<string, unknown>, name: string) => (item.customFields as { fieldId: string; value: unknown }[]).find((c) => c.fieldId === hireIds[name])?.value;
  const runField = (item: Record<string, unknown>, name: string) => (item.customFields as { fieldId: string; value: unknown }[]).find((c) => c.fieldId === runIds[name])?.value;
  return { ...fake, items, runIds, hireField, runField, allowFailures: () => { opts.failItemAt = undefined; } };
}

const input = { roomId: 'R', employeeId: 'u1', templateListId: 'T', startDate: '2026-09-25', userRoles: ['owner'] };

describe('provisionRoadmap', () => {
  it('tạo hồ sơ, list lộ trình, item gốc, 3 task, gán ASSIGNEE cuối cùng', async () => {
    const hub = hubFixture();
    const steps: string[] = [];
    const result = await provisionRoadmap(hub.app, input, (p) => steps.push(p.step));
    const hire = hub.items.H[0];
    expect(result.taskCount).toBe(3);
    expect(hire.stageId).toBe('HS1');
    expect(hub.hireField(hire, F.assignee)).toEqual(['u1']);
    expect(hub.hireField(hire, F.roadmapListId)).toBe(result.roadmapListId);
    expect(hub.hireField(hire, F.totalCount)).toBe(3);
    const run = hub.items[result.roadmapListId];
    const root = run.find((i) => i.parentId === null);
    expect(root?.name).toBe('Tổng quan');
    expect(run.filter((i) => i.parentId === root?._id)).toHaveLength(3);
    const nda = run.find((i) => i.name === 'Ký NDA');
    expect(hub.runField(nda!, F.deadline)).toBe('2026-09-25');
    expect(hub.runField(nda!, F.assignee)).toEqual(['u1']);
    expect(hub.runField(nda!, F.source)).toBe('tt1');
    const laptop = run.find((i) => i.name === 'Cấp laptop');
    expect(hub.runField(laptop!, F.assignee)).toEqual([]);
    expect(steps[0]).toBe('preflight');
    expect(steps[steps.length - 1]).toBe('finish');
  });

  it('từ chối khi không phải admin', async () => {
    const hub = hubFixture();
    await expect(provisionRoadmap(hub.app, { ...input, userRoles: ['user'] })).rejects.toThrow('NOT_ADMIN');
  });

  it('từ chối khi ngày bắt đầu là cuối tuần', async () => {
    const hub = hubFixture();
    await expect(provisionRoadmap(hub.app, { ...input, startDate: '2026-09-26' })).rejects.toThrow('START_NOT_WORKING_DAY');
  });

  it('từ chối khi nhân sự đã có hồ sơ đang chạy', async () => {
    const hub = hubFixture();
    await provisionRoadmap(hub.app, input);
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('HIRE_EXISTS');
  });

  it('lỗi giữa B4 thì hồ sơ sang Khởi tạo lỗi, resume tạo đúng phần thiếu, không trùng', async () => {
    const hub = hubFixture({ failItemAt: 3 }); // items.create lần 3 lỗi: hồ sơ=1, item gốc=2, task đầu tiên=3
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('PROVISION_FAILED');
    const hire = hub.items.H[0];
    expect(hire.stageId).toBe('HS3');
    expect(hub.hireField(hire, F.assignee)).toBeUndefined();
    hub.allowFailures();
    const result = await resumeProvision(hub.app, { roomId: 'R', hireItemId: String(hire._id), userRoles: ['owner'] });
    const run = hub.items[result.roadmapListId];
    const children = run.filter((i) => i.parentId !== null);
    expect(children).toHaveLength(3);
    expect(new Set(children.map((i) => hub.runField(i, F.source))).size).toBe(3);
    expect(hub.items.H[0].stageId).toBe('HS1');
  });

  it('cancelProvision xóa list và hồ sơ', async () => {
    const hub = hubFixture({ failItemAt: 2 });
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('PROVISION_FAILED');
    const hireId = String(hub.items.H[0]._id);
    const runId = String(hub.hireField(hub.items.H[0], F.roadmapListId));
    await cancelProvision(hub.app, { roomId: 'R', hireItemId: hireId, userRoles: ['owner'] });
    expect(hub.items.H).toHaveLength(0);
    expect(hub.items[runId]).toBeUndefined();
  });

  it('cancelProvision từ chối khi không phải admin', async () => {
    const hub = hubFixture({ failItemAt: 2 });
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('PROVISION_FAILED');
    const hireId = String(hub.items.H[0]._id);
    await expect(cancelProvision(hub.app, { roomId: 'R', hireItemId: hireId, userRoles: ['user'] })).rejects.toThrow('NOT_ADMIN');
    // Không admin thì không được xóa gì cả.
    expect(hub.items.H).toHaveLength(1);
  });

  it('item gốc sau khi provision parse được bằng parseRoadmapTask (đủ field bắt buộc)', async () => {
    const hub = hubFixture();
    const result = await provisionRoadmap(hub.app, input);
    const run = hub.items[result.roadmapListId];
    const root = run.find((i) => i.parentId === null);
    expect(root).toBeDefined();
    const parsed = parseRoadmapTask(root as unknown as Parameters<typeof parseRoadmapTask>[0], hub.runIds);
    expect(parsed.ok).toBe(true);
  });

  it('hồ sơ "Khởi tạo lỗi" (ASSIGNEE chưa được gán) vẫn chặn khởi tạo lại cho cùng nhân sự', async () => {
    const hub = hubFixture({ failItemAt: 2 }); // item gốc lỗi ngay sau khi tạo hồ sơ, trước khi ASSIGNEE được gán
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('PROVISION_FAILED');
    const hire = hub.items.H[0];
    expect(hire.stageId).toBe('HS3');
    expect(hub.hireField(hire, F.assignee)).toBeUndefined();
    // Bấm "Khởi tạo" lại cho cùng nhân sự: employeeIds rỗng (ASSIGNEE chưa
    // gán) nên phải nhận diện qua tên hồ sơ (= employeeId), không được để
    // lọt qua và tạo hồ sơ + list lộ trình song song.
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('HIRE_EXISTS');
    expect(hub.items.H).toHaveLength(1);
  });

  it('item gốc bị đổi tên ngoài app vẫn được resume nhận diện qua parentId, không tạo item gốc thứ hai', async () => {
    const hub = hubFixture({ failItemAt: 3 }); // hồ sơ=1, item gốc=2 (thành công), task đầu tiên=3 (lỗi) → 0 task con
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('PROVISION_FAILED');
    const hire = hub.items.H[0];
    const runId = String(hub.hireField(hire, F.roadmapListId));
    const root = hub.items[runId].find((i) => i.parentId === null);
    expect(root).toBeDefined();
    (root as Record<string, unknown>).name = 'Tong quan (da doi ten)';
    hub.allowFailures();
    await resumeProvision(hub.app, { roomId: 'R', hireItemId: String(hire._id), userRoles: ['owner'] });
    const roots = hub.items[runId].filter((i) => i.parentId === null);
    expect(roots).toHaveLength(1);
  });

  it('markFailed vẫn báo PROVISION_FAILED dù chính lệnh ghi trạng thái lỗi cũng thất bại', async () => {
    // items.update lần đầu (gắn roadmapListId lên hồ sơ) phải qua được, chỉ
    // lệnh update thứ 2 trở đi (markFailed ghi stage "Khởi tạo lỗi") mới lỗi.
    const hub = hubFixture({ failItemAt: 3, failUpdateFrom: 2 });
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('PROVISION_FAILED');
  });

  it('items.create ghi thành công nhưng response bị mất: resume không tạo task trùng', async () => {
    const hub = hubFixture({ persistThenFailItemAt: 3 }); // task đầu tiên: Hub ghi xong nhưng client nhận lỗi
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('PROVISION_FAILED');
    const hire = hub.items.H[0];
    const result = await resumeProvision(hub.app, { roomId: 'R', hireItemId: String(hire._id), userRoles: ['owner'] });
    const run = hub.items[result.roadmapListId];
    const children = run.filter((i) => i.parentId !== null);
    expect(children).toHaveLength(3);
    expect(new Set(children.map((i) => hub.runField(i, F.source))).size).toBe(3);
  });

  it('template không có task nào: từ chối, không tạo list lộ trình nào, hồ sơ sang Khởi tạo lỗi', async () => {
    const hub = hubFixture();
    const listsBefore = Object.keys(hub.items).length;
    await expect(provisionRoadmap(hub.app, { ...input, templateListId: 'TE' })).rejects.toThrow('TEMPLATE_INVALID');
    expect(Object.keys(hub.items).length).toBe(listsBefore);
    expect(hub.items.H[0]?.stageId).toBe('HS3');
  });

  it('danh sách hồ sơ bị giới hạn 500 (capped): từ chối khởi tạo thay vì tạo trùng âm thầm', async () => {
    const hub = hubFixture({ cappedListId: 'H' });
    await expect(provisionRoadmap(hub.app, input)).rejects.toThrow('SCHEMA_DRIFT');
    expect(hub.items.H).toHaveLength(0);
  });

  it('key list lộ trình dự kiến đã tồn tại (cancelProvision chỉ đổi tên list cũ, không xóa được): tạo với key khác', async () => {
    const wantedKey = runKey(input.employeeId, input.startDate);
    const hub = hubFixture({ extraLists: [{ _id: 'OLD-RUN', name: '(Đã hủy) OLD-RUN', key: wantedKey }] });
    const result = await provisionRoadmap(hub.app, input);
    const createdList = hub.items[result.roadmapListId];
    expect(createdList).toBeDefined();
    expect(result.taskCount).toBe(3);
    // key thật sự dùng để tạo list mới phải khác key đã bị chiếm bởi OLD-RUN.
    const calls = hub.calls.filter((c) => c.method === 'POST' && c.path === 'lists.create');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body?.key).not.toBe(wantedKey);
    expect(calls[0]!.body?.key).toBe(`${wantedKey}-2`);
  });
});
