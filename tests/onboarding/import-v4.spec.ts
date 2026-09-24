import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ImportedPosition } from '../../scripts/onboarding-import/models';
import { createMcpImportV4Gateway, importDraftTree, importPositionV4, type ImportV4Gateway } from '../../src/ui/onboarding/flows/import-v4';
import { dryRunSourceV4 } from '../../scripts/onboarding-import/import-source-v4';
import { V2_POSITION_FIELDS, V2 } from '../../src/ui/onboarding/domain/v2-fields';
import { fakeRestApp, ok } from './fake-app';

const demo = fileURLToPath(new URL('../../../AgentFiles onboarding/', import.meta.url));
const source: ImportedPosition = {
  sourceKey: 'Kỹ_Sư', sourceFingerprint: 'a'.repeat(64), name: 'Kỹ Sư',
  tree: { weeks: [{ id: 'Kỹ_Sư/Week_01', name: 'Tuần 1', order: 0 }], items: [
    { id: 'Kỹ_Sư/Day_01', kind: 'day', name: 'Ngày 1', stageId: 'Kỹ_Sư/Week_01', parentId: null, order: 1, content: '' },
    { id: 'Kỹ_Sư/Day_01/01.md', kind: 'lesson', name: 'Bài 1', stageId: 'Kỹ_Sư/Week_01', parentId: 'Kỹ_Sư/Day_01', order: 0,
      content: '# Bài 1', attachments: [], videos: [], read: false },
  ] },
};

function fakeGateway() {
  const calls: string[] = [];
  let matches: { id: string; sourceMarker: string }[] = [];
  const gateway: ImportV4Gateway = {
    async findPositionsBySource(sourceKey) { calls.push(`find:${sourceKey}`); return matches; },
    async checkTemplateKey() { calls.push('checkTemplateKey'); return 'ready'; },
    async saveDraft(_position, marker) { calls.push('save'); matches = [{ id: 'p1', sourceMarker: marker }]; return 'p1'; },
  };
  return { gateway, calls, setMatches: (value: typeof matches) => { matches = value; } };
}

describe('import v4', () => {
  it('maps source identity into stable draft IDs while preserving parent links', () => {
    const tree = importDraftTree(source);
    expect(tree.weeks[0].id).toBe(`draft:import:${source.sourceKey}:${source.sourceFingerprint}:Kỹ_Sư/Week_01`);
    expect(tree.items[0].stageId).toBe(tree.weeks[0].id);
    expect(tree.items[1].parentId).toBe(tree.items[0].id);
  });

  it('dry-runs the real Markdown source without a Hub gateway', async () => {
    const summaries = [];
    for await (const summary of dryRunSourceV4(demo)) summaries.push(summary);
    expect(summaries).toHaveLength(2);
    expect(summaries.every((summary) => summary.counts.days === 4)).toBe(true);
    expect(summaries.every((summary) => !summary.publishable)).toBe(true);
  });

  it('saves once and skips a matching source on retry without touching HR edits', async () => {
    const fake = fakeGateway();
    expect((await importPositionV4(fake.gateway, source)).state).toBe('created');
    expect((await importPositionV4(fake.gateway, source)).state).toBe('existing');
    expect(fake.calls.filter((call) => call === 'save')).toHaveLength(1);
  });

  it('rejects a changed source fingerprint and duplicate source registry identity', async () => {
    const fake = fakeGateway();
    fake.setMatches([{ id: 'p1', sourceMarker: `${source.sourceKey}:${'b'.repeat(64)}` }]);
    await expect(importPositionV4(fake.gateway, source)).rejects.toThrow('IMPORT_SOURCE_CHANGED');
    fake.setMatches([{ id: 'p1', sourceMarker: `${source.sourceKey}:${source.sourceFingerprint}` },
      { id: 'p2', sourceMarker: `${source.sourceKey}:${source.sourceFingerprint}` }]);
    await expect(importPositionV4(fake.gateway, source)).rejects.toThrow('IMPORT_SOURCE_CONFLICT');
  });

  it('reconciles a lost save response through exact source marker', async () => {
    const fake = fakeGateway();
    const original = fake.gateway.saveDraft;
    fake.gateway.saveDraft = async (position, marker) => { await original(position, marker); throw new Error('response lost'); };
    expect((await importPositionV4(fake.gateway, source)).state).toBe('created');
    expect(fake.calls.filter((call) => call === 'save')).toHaveLength(1);
  });

  it('fails closed on a conflicting template key instead of creating a duplicate', async () => {
    const fake = fakeGateway();
    fake.gateway.checkTemplateKey = async () => 'conflict';
    await expect(importPositionV4(fake.gateway, source)).rejects.toThrow('IMPORT_ORPHAN_CONFLICT');
    expect(fake.calls).not.toContain('save');
  });

  it('retries a partial first save under the same deterministic template key', async () => {
    const fake = fakeGateway();
    const keys: string[] = [];
    let first = true;
    const original = fake.gateway.saveDraft;
    fake.gateway.saveDraft = async (position, marker, key) => {
      keys.push(key);
      if (first) { first = false; throw new Error('item 3 failed'); }
      return original(position, marker, key);
    };
    await expect(importPositionV4(fake.gateway, source)).rejects.toThrow('item 3 failed');
    expect((await importPositionV4(fake.gateway, source)).state).toBe('created');
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('queries registry source identity through the mediated room-scoped tool', async () => {
    const marker = `${source.sourceKey}:${source.sourceFingerprint}`;
    const { app, toolCalls } = fakeRestApp([
      { method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: 'positions', name: 'Onboarding positions', roomId: 'room', isolatedList: true,
        fieldDefinitions: V2_POSITION_FIELDS.map((field) => ({ _id: `id:${field.name}`, name: field.name, type: field.type })) }, stages: [] }) },
      { method: 'POST', path: 'items.query', reply: () => ok({ items: [{ _id: 'p1', name: 'Kỹ Sư', stageId: 'draft',
        customFields: [{ fieldId: `id:${V2.importSource}`, value: marker }] }], nextCursor: null }) },
    ]);
    const gateway = createMcpImportV4Gateway(app, { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' });
    expect(await gateway.findPositionsBySource(source.sourceKey)).toEqual([{ id: 'p1', sourceMarker: marker }]);
    expect(toolCalls.find((call) => call.name === 'mcpapp.lists.queryItems')?.arguments).toMatchObject({
      listId: 'positions', filter: { archived: false, customFields: [{ fieldId: `id:${V2.importSource}`, op: 'contains', value: 'Kỹ_Sư:' }] },
    });
  });
});
