// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Position, TemplateTree } from '../../src/ui/onboarding/domain/models';
import { CopyTemplateDialog } from '../../src/ui/onboarding/views/templates/CopyTemplateDialog';

afterEach(cleanup);

const position: Position = { id: 'position-1', name: 'Kỹ sư', templateListId: 'template-1', status: 'ready', weeks: 2,
  days: 2, lessons: 0, questions: 0, missingAnswers: 0, inUse: 0 };
const tree: TemplateTree = { weeks: [{ id: 'week-1', name: 'Tuần 1', order: 0 }, { id: 'week-2', name: 'Tuần 2', order: 1 }], items: [
  { id: 'day-1', kind: 'day', name: 'Ngày 1', stageId: 'week-1', parentId: null, order: 1, content: '' },
  { id: 'day-2', kind: 'day', name: 'Ngày 2', stageId: 'week-2', parentId: null, order: 2, content: '' },
] };

describe('CopyTemplateDialog', () => {
  it('passes selected day ids and source position to the real copy callback', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn(async () => {});
    render(<CopyTemplateDialog sources={[{ position, tree }]} onCopy={onCopy} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Chọn ngày' }));
    expect((screen.getByRole('button', { name: 'Copy template' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Ngày 2' }));
    await user.click(screen.getByRole('button', { name: 'Copy template' }));
    expect(onCopy).toHaveBeenCalledWith(position, { kind: 'days', dayIds: ['day-2'] });
  });
});
