// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { FilesGateway } from '../../src/ui/onboarding/data/files';
import type { TemplateTree } from '../../src/ui/onboarding/domain/models';
import { AttachmentList } from '../../src/ui/onboarding/components/AttachmentList';
import { PrivosRestError } from '../../src/ui/privos-rest';
import { TemplateBuilder as PureTemplateBuilder, type TemplateBuilderProps } from '../../src/ui/onboarding/views/templates/TemplateBuilder';
import { createUiI18n } from '../../src/ui/i18n/config';
import type { UiLocale } from '../../src/ui/i18n/locale';

function render(ui: ReactElement, locale: UiLocale = 'vi') {
  const Wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={createUiI18n(locale)}>{children}</I18nextProvider>;
  return testingRender(ui, { wrapper: Wrapper });
}

type TestBuilderProps<T> = T extends unknown ? Omit<T, 'ids' | 'focus'> : never;
function TemplateBuilder(props: TestBuilderProps<TemplateBuilderProps>) {
  return <PureTemplateBuilder {...props} ids={{ next: () => crypto.randomUUID() }} focus={{ focus: (id) => document.getElementById(id)?.focus() }} />;
}

afterEach(cleanup);

const raw = { _id: 'file-1', name: 'guide.pdf', channel_id: 'room-1', folder_id: 'folder-1', file_size: 4 };
const ref = { id: 'file-1', name: 'guide.pdf', mimeType: 'application/pdf', raw };
const initial: TemplateTree = { weeks: [{ id: 'week-1', name: 'Tuần 1', order: 0 }], items: [
  { id: 'day-1', kind: 'day', name: 'Ngày 1', stageId: 'week-1', order: 1, parentId: null, content: '' },
  { id: 'lesson-1', kind: 'lesson', name: 'Bài học', stageId: 'week-1', order: 0, parentId: 'day-1', content: 'Nội dung', attachments: [], videos: [], read: false },
] };

function gateway() {
  const upload = vi.fn(async () => ({ ...ref, roomId: 'room-1', folderId: 'folder-1' }));
  const open = vi.fn(async () => {});
  const content = vi.fn(async () => ({
    fileId: 'file-1', name: 'guide.md', mimeType: 'text/markdown',
    blob: new Blob(['# Welcome\n\nRead this first.'], { type: 'text/markdown' }),
    text: '# Welcome\n\nRead this first.',
  }));
  const download = vi.fn(async () => {});
  const api: FilesGateway = { folder: vi.fn(async () => 'folder-1'), upload,
    metadata: vi.fn(async () => ({ ...ref, roomId: 'room-1', folderId: 'folder-1' })), content, download, open,
    move: vi.fn(async () => {}) };
  return { api, upload, open, content, download };
}

describe('lesson attachments', () => {
  it('offers upload while creating a template before the first draft is saved', () => {
    const { api } = gateway();
    render(<TemplateBuilder initial={initial} initialName="Kỹ sư" onSave={async () => {}} filesGateway={api} />);
    expect(screen.getByLabelText('Đính kèm file')).toBeTruthy();
  });

  it('creates a draft and persists the attachment when a file is selected', async () => {
    const user = userEvent.setup();
    const { api, upload } = gateway();
    const saves: { tree: TemplateTree; name: string; status: string; positionId?: string }[] = [];
    render(<TemplateBuilder initial={initial} initialName="Kỹ sư" filesGateway={api}
      onSave={async (tree, name, status, positionId) => {
        saves.push({ tree, name, status, positionId });
        return 'position-1';
      }} />);

    await user.upload(screen.getByLabelText('Đính kèm file'), new File(['data'], 'guide.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(screen.getByText('guide.pdf')).toBeTruthy());
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[0]).toMatchObject({ name: 'Kỹ sư', status: 'draft', positionId: undefined });
    expect(saves[1]).toMatchObject({ name: 'Kỹ sư', status: 'draft', positionId: 'position-1' });
    expect(saves[1].tree.items.find((item) => item.kind === 'lesson')).toMatchObject({ attachments: [ref] });
    expect(upload).toHaveBeenCalledWith('position-1', expect.objectContaining({ name: 'guide.pdf' }));
  });

  it('holds a selected file until a position name is entered, then uploads without a save click', async () => {
    const user = userEvent.setup();
    const { api, upload } = gateway();
    const saves: TemplateTree[] = [];
    render(<TemplateBuilder initial={initial} initialName="" filesGateway={api}
      onSave={async (tree) => { saves.push(tree); return 'position-1'; }} />);

    await user.upload(screen.getByLabelText('Đính kèm file'), new File(['data'], 'guide.pdf', { type: 'application/pdf' }));
    expect(screen.getByText(/guide.pdf.*tên vị trí/)).toBeTruthy();
    expect(saves).toHaveLength(0);
    expect(upload).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: 'Tên vị trí' }), 'Kỹ sư');
    await waitFor(() => expect(screen.getByText('guide.pdf')).toBeTruthy());
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('retries a failed upload without creating another draft', async () => {
    const user = userEvent.setup();
    const { api, upload } = gateway();
    upload.mockRejectedValueOnce(new Error('UPLOAD_FAILED'));
    const saves: TemplateTree[] = [];
    render(<TemplateBuilder initial={initial} initialName="Kỹ sư" filesGateway={api}
      onSave={async (tree) => { saves.push(tree); return 'position-1'; }} />);

    await user.upload(screen.getByLabelText('Đính kèm file'), new File(['data'], 'guide.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('guide.pdf'));
    expect(saves).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Thử lại tải file' }));
    await waitFor(() => expect(screen.getByText('guide.pdf')).toBeTruthy());
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('keeps a published template ready when another file is added in the creation editor', async () => {
    const user = userEvent.setup();
    const { api } = gateway();
    const statuses: string[] = [];
    render(<TemplateBuilder initial={initial} initialName="Kỹ sư" filesGateway={api}
      onSave={async (_tree, _name, status) => { statuses.push(status); return 'position-1'; }} />);

    await user.upload(screen.getByLabelText('Đính kèm file'), new File(['first'], 'first.pdf'));
    await waitFor(() => expect(statuses).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Sẵn sàng' }));
    await waitFor(() => expect(statuses).toHaveLength(3));
    await user.upload(screen.getByLabelText('Đính kèm file'), new File(['second'], 'second.pdf'));
    await waitFor(() => expect(statuses).toHaveLength(4));
    expect(statuses[3]).toBe('ready');
  });

  it('drops a pending file when its lesson is removed before naming the template', async () => {
    const user = userEvent.setup();
    const { api, upload } = gateway();
    const save = vi.fn(async () => 'position-1');
    render(<TemplateBuilder initial={initial} initialName="" filesGateway={api} onSave={save} />);

    await user.upload(screen.getByLabelText('Đính kèm file'), new File(['data'], 'guide.pdf'));
    await user.click(screen.getByRole('button', { name: 'Xóa bài học' }));
    await user.type(screen.getByRole('textbox', { name: 'Tên vị trí' }), 'K');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Lưu nháp' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/guide.pdf.*tên vị trí/)).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Chưa lưu');
    expect(save).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('never offers Hub upload in preview mode', () => {
    const { api } = gateway();
    render(<TemplateBuilder initial={initial} initialName="Kỹ sư" mode="preview"
      filesGateway={api} positionId="position-1" />);
    expect(screen.queryByLabelText('Đính kèm file')).toBeNull();
  });

  it('adds full upload ref to the draft and unlink keeps file bytes untouched', async () => {
    const user = userEvent.setup();
    const { api, upload } = gateway();
    const saved: TemplateTree[] = [];
    render(<TemplateBuilder initial={initial} initialName="Kỹ sư" onSave={async (tree) => { saved.push(tree); }}
      filesGateway={api} positionId="position-1" />);
    await user.upload(screen.getByLabelText('Đính kèm file'), new File(['data'], 'guide.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(screen.getByText('guide.pdf')).toBeTruthy());
    expect(upload).toHaveBeenCalledWith('position-1', expect.objectContaining({ name: 'guide.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const lesson = saved[0].items.find((item) => item.kind === 'lesson');
    expect(lesson?.kind === 'lesson' && lesson.attachments).toEqual([ref]);
    await user.click(screen.getByRole('button', { name: 'Bỏ liên kết guide.pdf' }));
    expect(screen.queryByText('guide.pdf')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(saved).toHaveLength(2));
    const unlinked = saved[1].items.find((item) => item.kind === 'lesson');
    expect(unlinked?.kind === 'lesson' && unlinked.attachments).toEqual([]);
    expect(api.move).not.toHaveBeenCalled();
  });

  it('downloads by file id through the authenticated content gateway', async () => {
    const user = userEvent.setup();
    const { api, download } = gateway();
    render(<AttachmentList files={[ref]} gateway={api} />);
    await user.click(screen.getByRole('button', { name: 'Tải xuống guide.pdf' }));
    expect(download).toHaveBeenCalledWith('file-1');
  });

  it('previews a Markdown attachment inside an accessible dialog', async () => {
    const user = userEvent.setup();
    const { api, content } = gateway();
    render(<AttachmentList files={[{ ...ref, name: 'guide.md', mimeType: 'md' }]} gateway={api} />, 'en');

    await user.click(screen.getByRole('button', { name: 'Open guide.md' }));

    const dialog = await screen.findByRole('dialog', { name: 'Preview guide.md' });
    expect(dialog.textContent).toContain('Welcome');
    expect(dialog.textContent).toContain('Read this first.');
    expect(content).toHaveBeenCalledWith('file-1');
    await user.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('localizes employee attachment controls in English', () => {
    const { api } = gateway();
    render(<AttachmentList files={[ref]} gateway={api} />, 'en');
    expect(screen.getByRole('button', { name: 'Open guide.pdf' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download guide.pdf' })).toBeTruthy();
    expect(screen.queryByText('Mở')).toBeNull();
  });

  it('shows a safe permission message when another member receives 403', async () => {
    const user = userEvent.setup();
    const { api } = gateway();
    vi.mocked(api.content).mockRejectedValueOnce(new PrivosRestError('raw private response', 403, 'error-not-allowed'));
    render(<AttachmentList files={[ref]} gateway={api} />, 'en');
    await user.click(screen.getByRole('button', { name: 'Open guide.pdf' }));
    expect((await screen.findByRole('alert')).textContent).toBe('You do not have permission to open this file.');
    expect(screen.queryByText(/raw private response/)).toBeNull();
  });
});
