import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Hire, Position } from '../../src/ui/onboarding/domain/models';
import { HiresCatalogTable, PositionsCatalogTable } from '../../src/ui/onboarding/views/V4CatalogTables';

const position: Position = { id: 'p1', name: 'Kế toán', templateListId: 't1', status: 'ready', weeks: 1, days: 5, lessons: 4, questions: 3, missingAnswers: 0, inUse: 2 };
const hire: Hire = { id: 'h1', employeeId: 'u1', name: 'Nguyễn An', positionId: 'p1', positionName: 'Kế toán', totalDays: 5, startDate: '2026-09-23', roadmapListId: 'r1', status: 'learning', doneDays: 2, scores: {}, errorCode: null, pendingAction: null };

describe('v4 catalog tables', () => {
  it('renders a position typeahead and keeps the selected position visible', () => {
    const html = renderToStaticMarkup(<HiresCatalogTable locale="en" items={[hire]} loading={false} error={null} search="" onSearch={() => {}} status="all" onStatus={() => {}} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} positionQuery="Accounting" selectedPosition={position} positionOptions={[position]} positionLookupOpen positionLookupLoading={false} positionLookupError={null} onPositionQuery={() => {}} onPositionFocus={() => {}} onPositionSelect={() => {}} onPositionClear={() => {}} onPositionClose={() => {}} />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Filter by position"');
    expect(html).toContain('value="Accounting"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain(position.name);
  });
  it('renders the current hire page without implying a room total', () => {
    const html = renderToStaticMarkup(<HiresCatalogTable items={[hire]} loading={false} error={null} search="" onSearch={() => {}} status="all" onStatus={() => {}} canPrevious={false} canNext={true} onPrevious={() => {}} onNext={() => {}} />);
    expect(html).toContain('Nguyễn An');
    expect(html).toContain('Kế toán');
    expect(html).toContain('2/5');
    expect(html).toContain('Điểm quiz');
    expect(html).toContain('Chưa có điểm');
    expect(html).toContain('Xem lộ trình');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Trong trang này');
    expect(html).not.toContain('tổng cộng');
  });

  it('renders an explicit empty position page', () => {
    const html = renderToStaticMarkup(<PositionsCatalogTable items={[]} loading={false} error={null} search="" onSearch={() => {}} status="all" onStatus={() => {}} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} />);
    expect(html).toContain('Chưa có vị trí');
    expect(html).toContain('Template theo vị trí');
    expect(html).not.toContain(position.name);
  });

  it('shows the selected status card and a disabled template action', () => {
    const hiresHtml = renderToStaticMarkup(<HiresCatalogTable items={[hire]} loading={false} error={null} search="" onSearch={() => {}} status="learning" onStatus={() => {}} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} />);
    const positionsHtml = renderToStaticMarkup(<PositionsCatalogTable items={[position]} loading={false} error={null} search="" onSearch={() => {}} status="all" onStatus={() => {}} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} />);
    expect(hiresHtml).toContain('aria-pressed="true"');
    expect(positionsHtml).toContain('Mở');
    expect(positionsHtml).toContain('disabled=""');
  });

  it('translates the active table and room configuration error in English', () => {
    const html = renderToStaticMarkup(<HiresCatalogTable locale="en" items={[]} loading={false} error="Room chưa có cấu hình list onboarding." search="" onSearch={() => {}} status="all" onStatus={() => {}} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} />);
    expect(html).toContain('Manage onboarding');
    expect(html).toContain('Onboarding Lists are not configured for this room.');
    expect(html).not.toContain('Quản lý onboarding');
  });
});
