// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalogs } from '../../src/ui/onboarding/ports/catalogs';
import type { Hire, Position, TemplateTree } from '../../src/ui/onboarding/domain/models';
import type { PreparedProvisionV4, ProvisionOutcome } from '../../src/ui/onboarding/ports/provision';
import type { OnboardingServices } from '../../src/ui/onboarding/ports/ui-services';
import { OnboardingI18nProvider, useUiLocale } from '../../src/ui/i18n/OnboardingI18nProvider';
import { HiresCatalogTable } from '../../src/ui/onboarding/views/V4CatalogTables';
import { HrV4Drawer } from '../../src/ui/onboarding/views/HrV4Drawer';
import { ProvisionV4Form } from '../../src/ui/onboarding/views/ProvisionV4Form';

afterEach(cleanup);

const preferences = { get: async () => null, set: async () => {} };
const position: Position = { id: 'p1', name: 'Engineer', templateListId: 'tpl-1', status: 'ready', weeks: 1, days: 1, lessons: 1, questions: 0, missingAnswers: 0, inUse: 1 };
const tree: TemplateTree = { weeks: [{ id: 'w1', name: 'Tuần 1', order: 0 }], items: [{ id: 'd1', kind: 'day', name: 'Ngày 1', stageId: 'w1', order: 0, parentId: null, content: '' }] };
const hire: Hire = { id: 'h1', employeeId: 'u1', name: 'Nguyễn An', positionId: 'p1', positionName: 'Engineer', totalDays: 1, startDate: '2026-09-23', roadmapListId: 'run-1', status: 'learning', doneDays: 0, scores: {}, errorCode: null, pendingAction: null };

function LanguageButtons() {
  const { setLocale } = useUiLocale();
  return <><button type="button" onClick={() => setLocale('vi')}>VI</button><button type="button" onClick={() => setLocale('en')}>EN</button></>;
}

function CatalogHarness({ catalogs, services }: { catalogs: Catalogs; services: Pick<OnboardingServices, 'hr' | 'provision'> }) {
  const [search, setSearch] = useState('');
  const [selectedHireId, setSelectedHireId] = useState<string | null>(null);
  return <>
    <LanguageButtons />
    <HiresCatalogTable items={[hire]} loading={false} error={null} search={search} onSearch={setSearch} status="all" onStatus={() => {}} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} onOpen={(item) => setSelectedHireId(item.id)} />
    {selectedHireId && <HrV4Drawer catalogs={catalogs} services={services} hireId={selectedHireId} onClose={() => setSelectedHireId(null)} onChanged={() => {}} />}
  </>;
}

describe('admin localization', () => {
  it('preserves filters, drawer, and an in-flight provision while locale changes', async () => {
    const hireCall = vi.fn(async () => hire);
    const catalogs: Catalogs = {
      positions: vi.fn(async () => ({ items: [position], nextCursor: null })),
      hires: vi.fn(async () => ({ items: [hire], nextCursor: null })),
      position: vi.fn(async () => position),
      hire: hireCall,
      template: vi.fn(async () => tree),
      roadmap: vi.fn(async () => { throw new Error('UNUSED'); }),
    };
    const hr: Pick<OnboardingServices, 'hr' | 'provision'> = {
      hr: {
        cancelActive: async () => ({ hire, needsRecount: false }),
        cancelFailed: async () => {},
        disablePosition: async () => {},
        recountPosition: async () => 1,
      },
      provision: {
        start: async () => ({ state: 'active', hireId: 'h1', roadmapListId: 'run-1' }),
        resume: async () => ({ state: 'active', hireId: 'h1', roadmapListId: 'run-1' }),
        recount: async () => 1,
        fingerprint: async () => 'hash',
        operationId: async () => 'operation-1',
      },
    };
    const user = userEvent.setup();
    const catalogView = render(
      <OnboardingI18nProvider userId="admin" preferences={preferences} browserLocale="vi">
        <CatalogHarness catalogs={catalogs} services={hr} />
      </OnboardingI18nProvider>,
    );
    const search = screen.getByRole('textbox', { name: 'Tìm nhân sự' });
    await user.type(search, 'An');
    await user.click(screen.getByRole('button', { name: 'Xem lộ trình' }));
    await screen.findByRole('dialog', { name: 'Chi tiết onboarding' });
    await user.click(screen.getByText('EN', { selector: 'button' }));
    expect((search as HTMLInputElement).value).toBe('An');
    expect(screen.getByRole('dialog', { name: 'Onboarding details' })).toBeTruthy();
    expect(screen.getAllByText('Learning').length).toBeGreaterThan(0);
    expect(screen.getAllByText('09/23/2026')).toHaveLength(2);
    expect(hireCall).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0%')).toBeTruthy();
    catalogView.unmount();

    let finish: ((value: ProvisionOutcome) => void) | undefined;
    const pending = new Promise<ProvisionOutcome>((resolve) => { finish = resolve; });
    const start = vi.fn((_prepared: PreparedProvisionV4) => pending);
    const formServices: Pick<OnboardingServices, 'provision' | 'members' | 'clock' | 'ids'> = {
      members: { list: async () => [{ id: 'u1', username: 'an', name: 'Nguyễn An' }], lookup: async () => ({ kind: 'not-found' }) },
      provision: {
        start,
        resume: async () => { throw new Error('UNUSED'); },
        recount: async () => 1,
        fingerprint: async () => 'fingerprint',
        operationId: async () => 'operation-1',
      },
      clock: { now: () => new Date(2026, 8, 29, 9) },
      ids: { next: () => 'operation-1' },
    };
    render(
      <OnboardingI18nProvider userId="admin" preferences={preferences} browserLocale="vi">
        <LanguageButtons />
        <ProvisionV4Form binding={{ roomId: 'room-1', positionsListId: 'positions', hiresListId: 'hires' }} catalogs={catalogs} services={formServices} onDone={() => {}} />
      </OnboardingI18nProvider>,
    );
    await screen.findByRole('option', { name: 'Nguyễn An (@an)' });
    await user.selectOptions(screen.getByLabelText('Nhân sự'), 'u1');
    await user.selectOptions(screen.getByLabelText('Vị trí'), 'p1');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tạo onboarding' }) as HTMLButtonElement).disabled).toBe(false));
    const date = screen.getByLabelText('Ngày bắt đầu') as HTMLInputElement;
    expect(date.value).toBe('2026-09-29');
    await user.click(screen.getByRole('button', { name: 'Tạo onboarding' }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    const prepared = start.mock.calls[0]?.[0];
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect((screen.getByLabelText('Employee') as HTMLSelectElement).value).toBe('u1');
    expect((screen.getByLabelText('Position') as HTMLSelectElement).value).toBe('p1');
    expect((screen.getByLabelText('Start date') as HTMLInputElement).value).toBe('2026-09-29');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[0]).toBe(prepared);
    await act(async () => finish?.({ state: 'active', hireId: 'h1', roadmapListId: 'run-1' }));
  });
});
