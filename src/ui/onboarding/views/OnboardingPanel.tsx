// src/ui/onboarding/views/OnboardingPanel.tsx
import { lazy, Suspense, useState } from 'react';
import { useOnboardingSession } from '../../composition/PrivosOnboardingRoot';
import { isRoomAdmin } from '../domain/roles';
import { V4Onboarding } from './V4Onboarding';
import type { ProbeEnvironment } from '../dev/probe-port';

const PrivosProbeProvider = import.meta.env.DEV ? lazy(() => import('../dev/privos-probes')) : null;
const HubContractProbe = import.meta.env.DEV ? lazy(() => import('../dev/HubContractProbe')) : null;
const P02ContractProbe = import.meta.env.DEV ? lazy(() => import('../dev/P02ContractProbe')) : null;
const P03LimitsProbe = import.meta.env.DEV ? lazy(() => import('../dev/P03LimitsProbe')) : null;

export function probeIdentityKey(roomId: string, userId?: string): string {
  return JSON.stringify([roomId, userId ?? null]);
}

export function probeSurfaceKey(roomId: string, userId: string | undefined, admin: boolean): string {
  return JSON.stringify([roomId, userId ?? null, admin]);
}

function P0ProbeSurface({ roomId, userId, admin, probe }: { roomId: string; userId?: string; admin: boolean; probe: ProbeEnvironment }) {
  const [screen, setScreen] = useState<'probe' | 'p02' | 'p03'>(admin ? 'probe' : 'p02');
  const identity = probeIdentityKey(roomId, userId);
  return (
    <div className="container">
      <h1>P0 Hub contract tests</h1>
      <p>Room: {roomId}. Chỉ dùng dữ liệu thử nghiệm và xác nhận mục tiêu trong từng probe.</p>
      <nav aria-label="P0 probes" className="form-actions">
        {admin && HubContractProbe && <button type="button" aria-current={screen === 'probe' ? 'page' : undefined} onClick={() => setScreen('probe')}>P0.1 Hub contract</button>}
        {P02ContractProbe && <button type="button" aria-current={screen === 'p02' ? 'page' : undefined} onClick={() => setScreen('p02')}>P0.2 ACL and Files</button>}
        {admin && P03LimitsProbe && <button type="button" aria-current={screen === 'p03' ? 'page' : undefined} onClick={() => setScreen('p03')}>P0.3 limits</button>}
      </nav>
      {admin && screen === 'probe' && HubContractProbe && <Suspense fallback={<p>Đang mở P0.1…</p>}><HubContractProbe key={identity} probe={probe} /></Suspense>}
      {screen === 'p02' && P02ContractProbe && <Suspense fallback={<p>Đang mở P0.2…</p>}><P02ContractProbe key={identity} probe={probe} /></Suspense>}
      {admin && screen === 'p03' && P03LimitsProbe && <Suspense fallback={<p>Đang mở P0.3…</p>}><P03LimitsProbe key={identity} probe={probe} /></Suspense>}
    </div>
  );
}

export default function OnboardingPanel() {
  const session = useOnboardingSession();
  if (!session) throw new Error('ONBOARDING_SESSION_MISSING');
  const { roomId, userId, roles: userRoles } = session.actor;
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [employeePreview, setEmployeePreview] = useState({ key: session.key, active: false });
  if (!roomId) return <div className="container"><p className="loading-text">Mở app bên trong một room.</p></div>;
  const admin = isRoomAdmin(userRoles ?? []);
  const previewActive = import.meta.env.DEV && admin && employeePreview.key === session.key && employeePreview.active;
  if (import.meta.env.DEV && showDiagnostics) return <>
    <button type="button" onClick={() => setShowDiagnostics(false)}>Trở lại giao diện v4</button>
    {PrivosProbeProvider && <Suspense fallback={<p>Đang mở kiểm tra P0…</p>}><PrivosProbeProvider>{(probe) =>
      <P0ProbeSurface key={probeSurfaceKey(roomId, userId, admin)} roomId={roomId} userId={userId} admin={admin} probe={probe} />
    }</PrivosProbeProvider></Suspense>}
  </>;
  return (
    <>
      <V4Onboarding key={session.key} admin={admin && !previewActive}
        employeePreviewControl={import.meta.env.DEV && admin ? {
          active: previewActive,
          onToggle: () => setEmployeePreview({ key: session.key, active: !previewActive }),
          labels: {
            vi: { inactive: 'Xem giao diện nhân sự', active: 'Quay lại quản trị' },
            en: { inactive: 'Preview employee view', active: 'Return to administration' },
          },
        } : undefined} />
      {import.meta.env.DEV && <button className="v4-diagnostics-entry" type="button" onClick={() => setShowDiagnostics(true)}>Kiểm tra kỹ thuật P0</button>}
    </>
  );
}
