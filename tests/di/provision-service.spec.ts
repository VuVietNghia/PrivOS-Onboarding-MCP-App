import { expect, it } from 'vitest';
import { canonicalTemplate, createProvisionService } from '../../src/ui/onboarding/flows/provision-v4';
import type { TemplateTree } from '../../src/ui/onboarding/domain/models';
import { createListStub } from './support/list-stub';

it('uses a stable canonical template independent of query ordering', () => {
  const tree: TemplateTree = {
    weeks: [{ id: 'w2', name: 'Two', order: 1 }, { id: 'w1', name: 'One', order: 0 }],
    items: [],
  };
  expect(canonicalTemplate(tree)).toBe(canonicalTemplate({ ...tree, weeks: [...tree.weeks].reverse() }));
  expect(canonicalTemplate(tree)).not.toBe(canonicalTemplate({
    weeks: [{ id: 'w1', name: 'Changed', order: 0 }], items: [],
  }));
});

it('denies a non-admin before reading or writing lists', async () => {
  const lists = createListStub();
  const service = createProvisionService({
    ...lists,
    binding: { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' },
    actor: { roomId: 'room', roomType: 'c', userId: 'user', roles: [], grantedScopes: [] },
    catalogs: { position: async () => { throw new Error('UNEXPECTED_CATALOG'); },
      template: async () => { throw new Error('UNEXPECTED_CATALOG'); },
      hires: async () => { throw new Error('UNEXPECTED_CATALOG'); } },
    hasher: { sha256: async () => 'fingerprint' },
  });
  const prepared = {
    input: { positionId: 'position', employeeId: 'employee', employeeName: 'Employee', startDate: '2026-09-25', operationId: 'operation-1' },
    position: { id: 'position', name: 'Engineer', status: 'ready' as const, templateListId: 'template', inUse: 0,
      weeks: 0, days: 0, lessons: 0, questions: 0, missingAnswers: 0 },
    tree: { weeks: [], items: [] }, fingerprint: 'fingerprint',
  };
  await expect(service.start(prepared)).rejects.toMatchObject({ code: 'NOT_ADMIN' });
  await expect(service.recount('position')).rejects.toMatchObject({ code: 'NOT_ADMIN' });
  expect(lists.read.readListInfo).not.toHaveBeenCalled();
});
