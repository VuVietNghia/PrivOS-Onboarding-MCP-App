import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPositions } from '../../scripts/onboarding-import/read-source';

const fixture = fileURLToPath(new URL('./fixtures/source/', import.meta.url));
const demo = fileURLToPath(new URL('../../../AgentFiles onboarding/', import.meta.url));

async function collect(source: string) {
  const positions = [];
  for await (const position of readPositions(source)) positions.push(position);
  return positions;
}

describe('readPositions', () => {
  it('reads the legacy demo with common days and complete Markdown', async () => {
    const positions = await collect(demo);
    expect(positions).toHaveLength(2);
    for (const position of positions) {
      expect(position.tree.items.filter((item) => item.kind === 'day')).toHaveLength(4);
      const expectedQuestions = position.sourceKey === 'Marketing_Executive' ? 23 : 22;
      expect(position.tree.items.filter((item) => item.kind === 'question')).toHaveLength(expectedQuestions);
      expect(position.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(position.tree.items.some((item) => item.kind === 'lesson' && item.content.includes('[CẦN ĐIỀN]'))).toBe(true);
      expect(position.tree.items.every((item) => !item.id.includes('00_master_index.md'))).toBe(true);
    }
  });

  it('keeps week metadata on direct and nested days; position day overrides common day', async () => {
    const positions = await collect(fixture);
    const first = positions.find((position) => position.sourceKey === 'Kỹ_Sư');
    expect(first).toBeDefined();
    expect(first?.tree.items.filter((item) => item.kind === 'day')).toHaveLength(2);
    const dayOne = first?.tree.items.find((item) => item.kind === 'day' && item.order === 1);
    expect(dayOne?.id).toBe('Kỹ_Sư/Week_09_New/Day_01_Override');
    expect(first?.tree.weeks.find((week) => week.id === dayOne?.stageId)?.name).toBe('New');
    expect(first?.tree.weeks.some((week) => week.id.startsWith('00_Common_Onboarding'))).toBe(false);
  });

  it('reads three positions with 2, 5, and 7 days without common source', async () => {
    const positions = await collect(fileURLToPath(new URL('./fixtures/no-common/', import.meta.url)));
    expect(positions.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))
      .map((position) => position.tree.items.filter((item) => item.kind === 'day').length)).toEqual([2, 5, 7]);
  });

  it('fails on duplicate day number across weeks in one position', async () => {
    await expect(collect(fileURLToPath(new URL('./fixtures/duplicate-day/', import.meta.url))))
      .rejects.toThrow(/duplicate.*Day_01/i);
  });

  it('does not reuse a checkpoint fingerprint for an identical but separate source root', async () => {
    const first = await collect(fileURLToPath(new URL('./fixtures/root-a/', import.meta.url)));
    const second = await collect(fileURLToPath(new URL('./fixtures/root-b/', import.meta.url)));
    expect(first[0].sourceFingerprint).not.toBe(second[0].sourceFingerprint);
  });
});
