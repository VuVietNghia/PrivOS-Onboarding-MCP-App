// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HiresCatalogTable, PositionsCatalogTable } from '../../src/ui/onboarding/views/V4CatalogTables';
import { renderI18n } from '../helpers/render-i18n';

afterEach(cleanup);
const base = { items: [], loading: false, error: null, search: '', onSearch: vi.fn(), status: 'all' as const,
  onStatus: vi.fn(), canPrevious: false, canNext: false, onPrevious: vi.fn(), onNext: vi.fn() };

describe('catalog filter UX', () => {
  it('offers hire statuses in one native select and applies the selected value', async () => {
    const onStatus = vi.fn();
    const view = renderI18n(<HiresCatalogTable {...base} onStatus={onStatus} />, 'en');
    const select = screen.getByRole('combobox', { name: 'Filter by status' });
    expect(select.tagName).toBe('SELECT');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All statuses', 'Learning', 'Completed', 'Setting up', 'Setup failed', 'Cancelled',
    ]);
    expect(screen.queryByRole('button', { name: 'Setup failed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    await view.user.selectOptions(select, 'failed');
    expect(onStatus).toHaveBeenCalledWith('failed');
  });

  it('offers a reset beside an empty filtered template result and clears both conditions', async () => {
    const onSearch = vi.fn(); const onStatus = vi.fn();
    const view = renderI18n(<PositionsCatalogTable {...base} search="Engineer" status="ready" onSearch={onSearch} onStatus={onStatus} />, 'en');
    const select = screen.getByRole('combobox', { name: 'Filter template status' });
    expect((select as HTMLSelectElement).value).toBe('ready');
    expect(within(select).getAllByRole('option')).toHaveLength(4);
    await view.user.selectOptions(select, 'disabled');
    expect(onStatus).toHaveBeenCalledWith('disabled');
    expect(screen.getByText('No results match your filters.')).toBeTruthy();
    await view.user.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!);
    expect(onSearch).toHaveBeenCalledWith(''); expect(onStatus).toHaveBeenCalledWith('all');
    expect(screen.getByText(/Latest updated/)).toBeTruthy();
  });

  it.each(['hires', 'templates'] as const)('shows an updating state instead of zero results for %s', (kind) => {
    renderI18n(kind === 'hires' ? <HiresCatalogTable {...base} loading /> : <PositionsCatalogTable {...base} loading />, 'en');
    expect(screen.getByText('Updating results…')).toBeTruthy();
    expect(screen.queryByText(/Showing 0/)).toBeNull();
  });
});
