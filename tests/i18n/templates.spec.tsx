// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateTree } from '../../src/ui/onboarding/domain/models';
import type { OnboardingServices } from '../../src/ui/onboarding/ports/ui-services';
import { createBrowserEffects } from '../../src/ui/adapters/browser-effects';
import { TemplateBuilder } from '../../src/ui/onboarding/views/templates/TemplateBuilder';
import { ImportFolderPanel } from '../../src/ui/onboarding/views/templates/ImportFolderPanel';
import { CopyTemplateDialog } from '../../src/ui/onboarding/views/templates/CopyTemplateDialog';
import { renderI18n } from '../helpers/render-i18n';

afterEach(cleanup);

const tree: TemplateTree = {
  weeks: [{ id: 'w1', name: 'Tuần khởi động', order: 0 }],
  items: [
    { id: 'd1', kind: 'day', name: 'Ngày làm quen', stageId: 'w1', order: 1, parentId: null, content: '' },
    { id: 'l1', kind: 'lesson', name: 'Giới thiệu', stageId: 'w1', order: 0, parentId: 'd1', content: 'Nội dung', attachments: [], videos: [], read: false },
  ],
};

function selectedFile(path: string, content: string): File {
  const file = new File([content], path.split('/').at(-1) ?? 'source.md', { type: 'text/markdown' });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  Object.defineProperty(file, 'text', { value: async () => content });
  return file;
}

describe('template localization', () => {
  it('keeps the draft and selected day while a save finishes across a locale change', async () => {
    let resolveSave: (() => void) | undefined;
    const pendingSave = new Promise<void>((resolve) => { resolveSave = resolve; });
    const onSave = vi.fn(() => pendingSave);
    const view = renderI18n(<TemplateBuilder initial={tree} initialName="Kỹ sư" onSave={onSave}
      ids={{ next: () => 'next-id' }} focus={{ focus: () => {} }} />);

    const name = screen.getByRole('textbox', { name: 'Tên vị trí' });
    await view.user.clear(name);
    await view.user.type(name, 'Kỹ sư nền tảng');
    await view.user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect(screen.getByRole('status').textContent).toContain('Đang lưu');

    await act(async () => { await view.i18n.changeLanguage('en'); });

    expect((screen.getByRole('textbox', { name: 'Position name' }) as HTMLInputElement).value).toBe('Kỹ sư nền tảng');
    expect(screen.getByRole('button', { name: 'Ngày làm quen' }).getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('status').textContent).toContain('Saving');
    expect(onSave).toHaveBeenCalledOnce();

    await act(async () => { resolveSave?.(); await pendingSave; });
    expect(screen.getByRole('status').textContent).toContain('Saved');
    expect(onSave).toHaveBeenCalledWith(expect.any(Object), 'Kỹ sư nền tảng', 'draft', undefined);
  });

  it('translates a safe import error without rerunning or exposing parser details', async () => {
    const importPosition = vi.fn();
    const services: Pick<OnboardingServices, 'imports' | 'hasher'> = {
      hasher: createBrowserEffects().hasher,
      imports: { importPosition },
    };
    const view = renderI18n(<ImportFolderPanel services={services}
      binding={{ roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' }}
      roomId="room" userRoles={['admin']} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Thư mục Markdown'), { target: { files: [
      selectedFile('AgentFiles/Role/Day_01_Start/quiz_day_01.md', '**Q1.1 (Trắc nghiệm).** Câu?\na) Một'),
    ] } });
    await view.user.click(screen.getByRole('button', { name: 'Kiểm tra nguồn' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Nội dung Markdown không đúng định dạng.');
    expect(alert.textContent).not.toContain('quiz_day_01.md');
    expect(alert.textContent).not.toContain(':1');

    await act(async () => { await view.i18n.changeLanguage('en'); });
    expect(screen.getByRole('alert').textContent).toContain('The Markdown content has an invalid format.');
    expect(importPosition).not.toHaveBeenCalled();
  });

  it('localizes copy and file controls in English', async () => {
    const source = {
      position: { id: 'p1', name: 'Engineer', templateListId: 't1', status: 'ready' as const, weeks: 1, days: 1, lessons: 1, questions: 0, missingAnswers: 0, inUse: 0 },
      tree,
    };
    const copyView = renderI18n(<CopyTemplateDialog sources={[source]} onCopy={() => {}} onClose={() => {}} />, 'en');
    expect(screen.getByRole('dialog', { name: 'Copy template' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Source position' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Content to copy' })).toBeTruthy();
    copyView.unmount();

    renderI18n(<TemplateBuilder initial={tree} initialName="Engineer" positionId="p1" onSave={async () => {}}
      filesGateway={{
        folder: async () => 'folder',
        upload: async () => ({ id: 'f1', name: 'guide.pdf', roomId: 'room', folderId: 'folder', raw: {} }),
        metadata: async () => ({ id: 'f1', name: 'guide.pdf', roomId: 'room', folderId: 'folder', raw: {} }),
        content: async () => ({ fileId: 'file-1', name: 'guide.md', mimeType: 'text/markdown', blob: new Blob(), text: '' }),
        download: async () => {}, open: async () => {}, move: async () => {},
      }}
      ids={{ next: () => 'next-id' }} focus={{ focus: () => {} }} />, 'en');
    await waitFor(() => expect(screen.getByLabelText('Attach file')).toBeTruthy());
    expect(screen.getByRole('region', { name: 'Attachments for Giới thiệu' })).toBeTruthy();
  });
});
