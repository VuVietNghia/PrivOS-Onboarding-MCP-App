// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FilesGateway } from '../../src/ui/onboarding/data/files';
import type { TemplateTree } from '../../src/ui/onboarding/domain/models';
import { AttachmentList } from '../../src/ui/onboarding/components/AttachmentList';
import { TemplateBuilder } from '../../src/ui/onboarding/views/templates/TemplateBuilder';

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
  const api: FilesGateway = { folder: vi.fn(async () => 'folder-1'), upload,
    metadata: vi.fn(async () => ({ ...ref, roomId: 'room-1', folderId: 'folder-1' })), open,
    move: vi.fn(async () => {}) };
  return { api, upload, open };
}

describe('lesson attachments', () => {
  it('hides upload until the first draft has a position id', () => {
    const { api } = gateway();
    render(<TemplateBuilder initial={initial} initialName="Kỹ sư" onSave={async () => {}} filesGateway={api} />);
    expect(screen.queryByLabelText('Đính kèm file')).toBeNull();
    expect(screen.getByText('Lưu nháp vị trí trước khi đính kèm file.')).toBeTruthy();
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

  it('opens and downloads by file id through the gateway', async () => {
    const user = userEvent.setup();
    const { api, open } = gateway();
    render(<AttachmentList files={[ref]} gateway={api} />);
    await user.click(screen.getByRole('button', { name: 'Mở guide.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Tải xuống guide.pdf' }));
    expect(open.mock.calls).toEqual([['file-1', 'view'], ['file-1', 'download']]);
  });
});
