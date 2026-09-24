// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeRestApp } from './fake-app';
import { ImportFolderPanel } from '../../src/ui/onboarding/views/templates/ImportFolderPanel';

vi.mock('../../src/ui/onboarding/flows/browser-import-v4', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/onboarding/flows/browser-import-v4')>();
  return { ...actual, importBrowserFolderV4: async function* (_app: unknown, _binding: unknown, _roomId: unknown, _roles: unknown, files: FileList) {
    for await (const preflight of actual.importBrowserFilesV4(files, { dryRun: true })) {
      if (preflight.state === 'dry-run') yield { state: 'created', positionId: 'p1', preflight: preflight.preflight };
    }
  } };
});

afterEach(cleanup);

function selectedFile(path: string, content: string): File {
  const file = new File([content], path.split('/').slice(-1)[0], { type: 'text/markdown' });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  // jsdom's File omits the browser File.text() method used by the source parser.
  Object.defineProperty(file, 'text', { value: async () => content });
  return file;
}

const binding = { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' };

describe('ImportFolderPanel', () => {
  it('requires a selected folder and shows its dry-run report before confirmation', async () => {
    const user = userEvent.setup();
    const { app } = fakeRestApp([]);
    render(<ImportFolderPanel app={app} binding={binding} roomId="room" userRoles={['admin']} onDone={() => {}} />);
    expect(screen.getByLabelText('Thư mục Markdown').hasAttribute('webkitdirectory')).toBe(true);
    expect((screen.getByRole('button', { name: 'Kiểm tra nguồn' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Xác nhận nhập/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Thư mục Markdown'), { target: { files: [
      selectedFile('AgentFiles/Kỹ_Sư/Day_01_Start/01_intro.md', '# Bài giới thiệu\n\nNội dung'),
    ] } });
    await user.click(screen.getByRole('button', { name: 'Kiểm tra nguồn' }));
    await waitFor(() => expect(screen.getByText('Kỹ Sư')).toBeTruthy());
    expect(screen.getByText(/1 ngày/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Xác nhận nhập/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('imports only after confirmation, reports completion and calls onDone once', async () => {
    const user = userEvent.setup();
    const { app } = fakeRestApp([]);
    const onDone = vi.fn();
    render(<ImportFolderPanel app={app} binding={binding} roomId="room" userRoles={['admin']} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Thư mục Markdown'), { target: { files: [
      selectedFile('AgentFiles/Role/Day_01_Start/01_intro.md', '# Bài giới thiệu\n\nNội dung'),
    ] } });
    await user.click(screen.getByRole('button', { name: 'Kiểm tra nguồn' }));
    await screen.findByText('Role');
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Xác nhận nhập/ }));
    await waitFor(() => expect(screen.getByText(/Hoàn tất: 1 vị trí/)).toBeTruthy());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps import disabled for a non-admin while allowing dry-run', async () => {
    const user = userEvent.setup();
    const { app } = fakeRestApp([]);
    render(<ImportFolderPanel app={app} binding={binding} roomId="room" userRoles={['member']} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Thư mục Markdown'), { target: { files: [
      selectedFile('AgentFiles/Role/Day_01_Start/01_intro.md', '# Bài giới thiệu\n\nNội dung'),
    ] } });
    await user.click(screen.getByRole('button', { name: 'Kiểm tra nguồn' }));
    await screen.findByText('Role');
    expect((screen.getByRole('button', { name: /Xác nhận nhập/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a source error without enabling import', async () => {
    const user = userEvent.setup();
    const { app } = fakeRestApp([]);
    render(<ImportFolderPanel app={app} binding={binding} roomId="room" userRoles={['admin']} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Thư mục Markdown'), { target: { files: [
      selectedFile('AgentFiles/Role/Day_01_Start/quiz_day_01.md', '**Q1.1 (Trắc nghiệm).** Câu?\na) Một'),
    ] } });
    await user.click(screen.getByRole('button', { name: 'Kiểm tra nguồn' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('quiz_day_01.md:1'));
    expect((screen.getByRole('button', { name: /Xác nhận nhập/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
