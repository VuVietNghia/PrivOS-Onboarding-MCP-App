// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Hire, Position } from '../../src/ui/onboarding/domain/models';
import { HiresCatalogTable } from '../../src/ui/onboarding/views/V4CatalogTables';
import { renderI18n } from '../helpers/render-i18n';

const hire: Hire = { id: 'h1', employeeId: 'u1', name: 'An', positionId: 'p1', positionName: 'Kế toán', totalDays: 5,
  startDate: '2026-09-23', roadmapListId: 'r1', status: 'learning', doneDays: 2, scores: {}, errorCode: null, pendingAction: null };
const positions: Position[] = [
  { id: 'p1', name: 'Kế toán', templateListId: 't1', status: 'ready', weeks: 1, days: 5, lessons: 4, questions: 3, missingAnswers: 0, inUse: 2 },
  { id: 'p2', name: 'Engineering', templateListId: 't2', status: 'ready', weeks: 1, days: 4, lessons: 3, questions: 2, missingAnswers: 0, inUse: 1 },
];

describe('position typeahead keyboard', () => {
  it('selects with arrows and Enter, closes with Escape, and keeps query through locale changes', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const common = { items: [hire], loading: false, error: null, search: '', onSearch: vi.fn(), status: 'all' as const,
      onStatus: vi.fn(), canPrevious: false, canNext: false, onPrevious: vi.fn(), onNext: vi.fn(),
      positionQuery: 'Eng', selectedPosition: null, positionOptions: positions, positionLookupOpen: true,
      positionLookupLoading: false, positionLookupError: null, onPositionQuery: vi.fn(), onPositionFocus: vi.fn(),
      onPositionSelect: onSelect, onPositionClear: vi.fn(), onPositionClose: onClose };
    const view = renderI18n(<HiresCatalogTable {...common} />, 'vi');
    const input = screen.getByRole('combobox', { name: 'Lọc theo vị trí' });
    input.focus();
    await view.user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(positions[1]);
    await view.user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    await view.i18n.changeLanguage('en');
    expect((screen.getByRole('combobox', { name: 'Filter by position' }) as HTMLInputElement).value).toBe('Eng');
    expect(screen.getByRole('option', { name: 'Engineering' })).toBeTruthy();
  });
});
