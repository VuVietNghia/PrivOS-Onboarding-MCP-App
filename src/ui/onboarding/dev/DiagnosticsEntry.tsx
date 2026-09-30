import { useState } from 'react';
import { useUiLocale } from '../../i18n/OnboardingI18nProvider';
import HubContractProbe from './HubContractProbe';
import P02ContractProbe from './P02ContractProbe';
import P03LimitsProbe from './P03LimitsProbe';
import PrivosProbeProvider from './privos-probes';
import { probeIdentityKey, probeSurfaceKey } from './probe-keys';
import type { OnboardingTheme } from '../views/OnboardingShell';

interface DiagnosticsEntryProps {
  roomId: string;
  userId?: string;
  admin: boolean;
  theme: OnboardingTheme;
}

const copy = {
  vi: {
    open: 'Kiểm tra kỹ thuật P0', back: 'Trở lại giao diện v4', title: 'Kiểm thử hợp đồng Hub P0',
    testData: (roomId: string) => `Room: ${roomId}. Chỉ dùng dữ liệu thử nghiệm và xác nhận mục tiêu trong từng probe.`,
    nav: 'Các probe P0', p01: 'P0.1 Hợp đồng Hub', p02: 'P0.2 ACL và Files', p03: 'P0.3 Giới hạn',
  },
  en: {
    open: 'Open P0 diagnostics', back: 'Return to the v4 interface', title: 'P0 Hub contract tests',
    testData: (roomId: string) => `Room: ${roomId}. Use test data only and confirm the target in each probe.`,
    nav: 'P0 probes', p01: 'P0.1 Hub contract', p02: 'P0.2 ACL and Files', p03: 'P0.3 limits',
  },
} as const;

export default function DiagnosticsEntry({ roomId, userId, admin, theme }: DiagnosticsEntryProps) {
  const { locale } = useUiLocale();
  const text = copy[locale];
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<'probe' | 'p02' | 'p03'>(admin ? 'probe' : 'p02');
  const identity = probeIdentityKey(roomId, userId);
  return <div className="onboarding-v4 v4-diagnostics-surface" data-theme-mode={theme} lang={locale}>
    {!open ? <button className="v4-diagnostics-entry" type="button" onClick={() => setOpen(true)}>{text.open}</button> : <div className="onboarding-probes">
    <button type="button" onClick={() => setOpen(false)}>{text.back}</button>
    <PrivosProbeProvider>{(probe) => <div className="container" key={probeSurfaceKey(roomId, userId, admin)}>
      <h1>{text.title}</h1>
      <p>{text.testData(roomId)}</p>
      <nav aria-label={text.nav} className="form-actions">
        {admin && <button type="button" aria-current={screen === 'probe' ? 'page' : undefined} onClick={() => setScreen('probe')}>{text.p01}</button>}
        <button type="button" aria-current={screen === 'p02' ? 'page' : undefined} onClick={() => setScreen('p02')}>{text.p02}</button>
        {admin && <button type="button" aria-current={screen === 'p03' ? 'page' : undefined} onClick={() => setScreen('p03')}>{text.p03}</button>}
      </nav>
      {admin && screen === 'probe' && <HubContractProbe key={identity} probe={probe} />}
      {screen === 'p02' && <P02ContractProbe key={identity} probe={probe} />}
      {admin && screen === 'p03' && <P03LimitsProbe key={identity} probe={probe} />}
    </div>}</PrivosProbeProvider>
  </div>}
  </div>;
}
