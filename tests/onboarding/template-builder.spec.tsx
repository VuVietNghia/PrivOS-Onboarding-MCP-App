// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TemplateTree } from '../../src/ui/onboarding/domain/models';
import { OnboardingError } from '../../src/ui/onboarding/domain/errors';
import { TemplateBuilder } from '../../src/ui/onboarding/views/templates/TemplateBuilder';

afterEach(cleanup);

describe('template builder', () => {
  it('labels an existing ready position as an edit with its real status', () => {
    render(<TemplateBuilder initial={{ weeks: [], items: [] }} initialName="A" initialStatus="ready" positionId="position-a" onSave={async () => {}} />);
    expect(screen.getByRole('heading', { name: 'Chỉnh sửa template onboarding' })).toBeTruthy();
    expect(screen.getByText('Sẵn sàng', { selector: '.v4-builder-title span' })).toBeTruthy();
  });

  it('stays dirty when the editor changes while a save is in flight', async () => {
    const user = userEvent.setup();
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    render(<TemplateBuilder initial={{ weeks: [], items: [] }} initialName="A" onSave={() => pending} />);
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect(screen.getByRole('status').textContent).toContain('Đang lưu');
    await user.type(screen.getByRole('textbox', { name: 'Tên vị trí' }), 'B');
    await act(async () => { finish?.(); await pending; });
    expect(screen.getByRole('status').textContent).toContain('Chưa lưu');
  });

  it('hiện lỗi lưu template dễ hiểu thay vì lộ mã nội bộ', async () => {
    const user = userEvent.setup();
    render(<TemplateBuilder initial={{ weeks: [{ id: 'w1', name: 'Tuần 1', order: 0 }], items: [] }}
      initialName="Engineer" initialStatus="disabled" positionId="p1"
      onSave={async () => { throw new OnboardingError('SCHEMA_DRIFT'); }} />);
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Cấu trúc list bị sửa ngoài app');
    expect(screen.getByRole('alert').textContent).not.toContain('SCHEMA_DRIFT');
  });

  it('moves focus to the field selected from the readiness checklist', async () => {
    const user = userEvent.setup();
    render(<TemplateBuilder initial={{ weeks: [], items: [] }} initialName="" onSave={async () => {}} />);
    await user.click(screen.getByRole('button', { name: 'Tên vị trí bắt buộc' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Tên vị trí' }));
  });

  it('keeps ready disabled until a named week has a day with valid content, then saves the tree', async () => {
    const user = userEvent.setup();
    const calls: { tree: TemplateTree; name: string; status: string }[] = [];
    const onSave = async (tree: TemplateTree, name: string, status: 'draft' | 'ready') => { calls.push({ tree, name, status }); };
    render(<TemplateBuilder initial={{ weeks: [], items: [] }} initialName="" onSave={onSave} />);
    expect((screen.getByRole('button', { name: 'Sẵn sàng' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Tên vị trí' }), 'Kỹ sư');
    await user.click(screen.getByRole('button', { name: 'Thêm tuần' }));
    expect((screen.getByRole('button', { name: 'Sẵn sàng' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getAllByRole('button', { name: 'Thêm ngày' })[0]);
    await user.click(screen.getByRole('button', { name: 'Thêm bài học' }));
    await user.type(screen.getByRole('textbox', { name: 'Tiêu đề bài học' }), 'Giới thiệu');
    await user.type(screen.getByRole('textbox', { name: 'Nội dung Markdown' }), 'Nội dung học');
    expect((screen.getByRole('button', { name: 'Sẵn sàng' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Sẵn sàng' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.name).toBe('Kỹ sư');
    expect(calls[0]?.status).toBe('ready');
    expect(calls[0]?.tree.items.map((item) => item.kind)).toEqual(['day', 'lesson']);
    expect(screen.getByRole('status').textContent).toContain('Đã lưu');
  });

  it('does not remove a populated week until its confirmation dialog is accepted', async () => {
    const user = userEvent.setup();
    render(<TemplateBuilder initial={{ weeks: [
      { id: 'w', name: 'Tuần 1', order: 0 },
      { id: 'w2', name: 'Tuần 2', order: 1 },
    ], items: [{ id: 'd', kind: 'day', name: 'Ngày 1', stageId: 'w', order: 1, parentId: null, content: '' }] }} initialName="Kỹ sư" onSave={async () => {}} />);
    await user.click(screen.getByRole('button', { name: 'Xóa tuần' }));
    expect(screen.getByRole('dialog').textContent).toContain('1 ngày');
    await user.click(screen.getByRole('button', { name: 'Giữ lại' }));
    expect(screen.getByRole('button', { name: /Tuần 1/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Xóa tuần' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    expect(screen.queryByRole('button', { name: /Tuần 1/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Tuần 2/ })).toBeTruthy();
  });

  it('keeps the correct answer on the same option after reorder and allows a lesson-only day', async () => {
    const user = userEvent.setup();
    const calls: TemplateTree[] = [];
    render(<TemplateBuilder initial={{ weeks: [{ id: 'w', name: 'Tuần 1', order: 0 }], items: [
      { id: 'd', kind: 'day', name: 'Ngày 1', stageId: 'w', order: 1, parentId: null, content: '' },
      { id: 'l', kind: 'lesson', name: 'Bài', stageId: 'w', order: 0, parentId: 'd', content: 'Nội dung', attachments: [], videos: [], read: false },
    ] }} initialName="Kỹ sư" onSave={async (tree) => { calls.push(tree); }} />);
    await user.click(screen.getByRole('button', { name: 'Thêm câu hỏi' }));
    expect((screen.getByRole('button', { name: 'Sẵn sàng' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Nội dung câu hỏi' }), 'Chọn đáp án');
    await user.type(screen.getByRole('textbox', { name: 'Lựa chọn 1' }), 'Đúng');
    await user.type(screen.getByRole('textbox', { name: 'Lựa chọn 2' }), 'Sai');
    await user.click(screen.getByRole('checkbox', { name: 'Đáp án đúng 1' }));
    await user.click(screen.getByRole('button', { name: 'Xuống 1' }));
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    const question = calls[0].items.find((item) => item.kind === 'question');
    expect(question?.kind === 'question' && question.options).toEqual(['Sai', 'Đúng']);
    expect(question?.kind === 'question' && question.correctLabels).toEqual(['b']);
    await user.click(screen.getByRole('button', { name: 'Xóa câu hỏi' }));
    expect((screen.getByRole('button', { name: 'Sẵn sàng' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
