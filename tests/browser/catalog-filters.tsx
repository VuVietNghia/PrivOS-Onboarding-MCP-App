import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createUiI18n } from '../../src/ui/i18n/config';
import { OnboardingShell, type OnboardingScreen, type OnboardingTheme } from '../../src/ui/onboarding/views/OnboardingShell';
import { HiresCatalogTable, PositionsCatalogTable } from '../../src/ui/onboarding/views/V4CatalogTables';
import type { Hire, HireStatus, Position, PositionStatus } from '../../src/ui/onboarding/domain/models';
import type { UiLocale } from '../../src/ui/i18n/locale';
import '../../src/ui/onboarding/onboarding-v4.css';

// Local layout fixture only; no Hub reads or writes.
const i18n = createUiI18n('vi');
const positions: Position[] = [{ id: 'p1', name: 'Kỹ sư phần mềm', templateListId: 't1', status: 'ready', weeks: 2, days: 10, lessons: 12, questions: 20, missingAnswers: 0, inUse: 2 }];
const hires: Hire[] = [{ id: 'h1', employeeId: 'u1', name: 'Nguyễn Minh Anh', positionId: 'p1', positionName: positions[0].name, totalDays: 10, startDate: '2026-10-01', roadmapListId: 'run1', status: 'learning', doneDays: 3, scores: {}, errorCode: null, pendingAction: null }];
function Fixture() {
  const [tab, setTab] = useState<OnboardingScreen>('hires');
  const [theme, setTheme] = useState<OnboardingTheme>('light');
  const [locale, setLocale] = useState<UiLocale>('vi');
  const [search, setSearch] = useState('');
  const [hireStatus, setHireStatus] = useState<HireStatus | 'all'>('all');
  const [positionStatus, setPositionStatus] = useState<PositionStatus | 'all'>('all');
  const [positionQuery, setPositionQuery] = useState('');
  const [selected, setSelected] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const common = { search, onSearch: setSearch, loading: false, error: null, canNext: false, canPrevious: false, onNext: () => {}, onPrevious: () => {} };
  return <OnboardingShell role="admin" roomId="local-fixture" screen={tab} onNavigate={setTab} theme={theme} onThemeChange={setTheme} locale={locale} onLocaleChange={(value) => { setLocale(value); void i18n.changeLanguage(value); }}>
    {tab === 'templates' ? <PositionsCatalogTable {...common} status={positionStatus} onStatus={setPositionStatus} items={positions.filter((item) => (positionStatus === 'all' || positionStatus === item.status) && item.name.includes(search))} /> : <HiresCatalogTable {...common} status={hireStatus} onStatus={setHireStatus} items={hires.filter((item) => (hireStatus === 'all' || hireStatus === item.status) && item.name.includes(search))} positionQuery={positionQuery} selectedPosition={selected} positionLookupOpen={open} positionOptions={positions} onPositionFocus={() => setOpen(true)} onPositionClose={() => { setOpen(false); setPositionQuery(selected?.name ?? ''); }} onPositionQuery={setPositionQuery} onPositionSelect={(value) => { setSelected(value); setPositionQuery(value.name); setOpen(false); }} onPositionClear={() => { setSelected(null); setPositionQuery(''); setOpen(false); }} />}
  </OnboardingShell>;
}
createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18n}><Fixture /></I18nextProvider>);
