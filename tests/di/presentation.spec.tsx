// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyBoundary } from '../../src/ui/lazy-boundary';
import { ThemeProvider, ThemeToggle } from '../../src/ui/theme-provider';
import { renderI18n } from '../helpers/render-i18n';

it('delegates reload to an injected capability', () => {
  const reload = vi.fn();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  function Broken(): never { throw new Error('CHUNK_UNAVAILABLE'); }
  try {
    render(<LazyBoundary reloadPage={{ reload }} logger={{ event() {} }}><Broken /></LazyBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  } finally { consoleError.mockRestore(); }
});

it('loads theme preference and applies it through the injected target', async () => {
  const apply = vi.fn();
  const set = vi.fn(async () => {});
  renderI18n(<ThemeProvider hostTheme="light" preferences={{ get: async () => 'dark', set }} target={{ apply }}>
    <ThemeToggle />
  </ThemeProvider>, 'en');
  await waitFor(() => expect(apply).toHaveBeenLastCalledWith('dark'));
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  await waitFor(() => expect(set).toHaveBeenCalledWith('theme-mode', 'light'));
  expect(apply).toHaveBeenLastCalledWith('light');
});
