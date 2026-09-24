import { describe, expect, it } from 'vitest';
import { readBrowserPositions, importBrowserFilesV4, type BrowserImportFile } from '../../src/ui/onboarding/flows/browser-import-v4';
import type { ImportV4Gateway } from '../../src/ui/onboarding/flows/import-v4';

function file(path: string, markdown: string): BrowserImportFile {
  return { name: path.split('/').at(-1) ?? '', webkitRelativePath: path, text: async () => markdown };
}

const files = [
  file('AgentFiles/00_master_index.md', '# Ignore'),
  file('AgentFiles/00_Common_Onboarding/Day_01_Common/01_intro.md', '# Chung\n\n[CẦN ĐIỀN]'),
  file('AgentFiles/Kỹ_Sư/Week_09_New/Day_01_Override/01_intro.md', '# Riêng\n\nNội dung'),
  file('AgentFiles/Kỹ_Sư/Day_02_Quiz/quiz_day_02.md', '**Q2.1 (Trắc nghiệm).** Chọn?\na) Một\nb) Hai\n<!-- answer: b -->'),
];

describe('browser folder import caller', () => {
  it('parses selected folder with common override, quiz and stable source keys', async () => {
    const positions = [];
    for await (const position of readBrowserPositions(files)) positions.push(position);
    expect(positions).toHaveLength(1);
    const [position] = positions;
    expect(position.sourceKey).toBe('Kỹ_Sư');
    expect(position.tree.items.filter((item) => item.kind === 'day')).toHaveLength(2);
    expect(position.tree.items.find((item) => item.kind === 'day' && item.order === 1)?.id).toBe('Kỹ_Sư/Week_09_New/Day_01_Override');
    expect(position.tree.items.find((item) => item.kind === 'question')?.id).toBe('Kỹ_Sư/Day_02_Quiz/quiz_day_02.md#Q2.1');
    expect(position.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('dry-run reads the files but makes no mediated tool calls', async () => {
    const reports = [];
    for await (const report of importBrowserFilesV4(files, { dryRun: true })) reports.push(report);
    expect(reports).toHaveLength(1);
    expect(reports[0].state).toBe('dry-run');
    expect(reports[0].preflight.counts.days).toBe(2);
  });

  it('write path requires verified context and uses the provided mediated gateway', async () => {
    let saves = 0;
    const gateway: ImportV4Gateway = {
      async findPositionsBySource() { return saves ? [{ id: 'p1', sourceMarker: savedMarker }] : []; },
      async checkTemplateKey() { return 'ready'; },
      async saveDraft(_position, marker) { saves++; savedMarker = marker; return 'p1'; },
    };
    let savedMarker = '';
    const context = { roomId: 'room', actorRoomId: 'room', actorRoles: ['admin'], gateway };
    const results = [];
    for await (const result of importBrowserFilesV4(files, { dryRun: false, ...context })) results.push(result);
    expect(results[0].state).toBe('created');
    expect(saves).toBe(1);
    for await (const _result of importBrowserFilesV4(files, { dryRun: false, ...context })) { /* retry */ }
    expect(saves).toBe(1);
  });

  it('rejects a mismatched room before any write', async () => {
    const gateway: ImportV4Gateway = { findPositionsBySource: async () => [], checkTemplateKey: async () => 'ready',
      saveDraft: async () => { throw new Error('must not write'); } };
    async function collect() { for await (const result of importBrowserFilesV4(files,
      { dryRun: false, roomId: 'room', actorRoomId: 'other', actorRoles: ['admin'], gateway })) void result; }
    await expect(collect()).rejects.toThrow('ROOM_MISMATCH');
  });
});
