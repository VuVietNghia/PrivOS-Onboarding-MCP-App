// src/ui/onboarding/views/OnboardingPanel.tsx
// Call site cho basic:information (usePrivosContext: roomId, userRoles) và lists:read / lists:write / lists:query (scope-audit).
import { lazy, Suspense, useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import { isRoomAdmin } from '../domain/roles';
import { V4Onboarding } from './V4Onboarding';

const HubContractProbe = import.meta.env.DEV ? lazy(() => import('../dev/HubContractProbe')) : null;
const P02ContractProbe = import.meta.env.DEV ? lazy(() => import('../dev/P02ContractProbe')) : null;
const P03LimitsProbe = import.meta.env.DEV ? lazy(() => import('../dev/P03LimitsProbe')) : null;

export function probeIdentityKey(roomId: string, userId?: string): string {
  return JSON.stringify([roomId, userId ?? null]);
}

export function probeSurfaceKey(roomId: string, userId: string | undefined, admin: boolean): string {
  return JSON.stringify([roomId, userId ?? null, admin]);
}

function P0ProbeSurface({ roomId, userId, admin }: { roomId: string; userId?: string; admin: boolean }) {
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
      {admin && screen === 'probe' && HubContractProbe && <Suspense fallback={<p>Đang mở P0.1…</p>}><HubContractProbe key={identity} /></Suspense>}
      {screen === 'p02' && P02ContractProbe && <Suspense fallback={<p>Đang mở P0.2…</p>}><P02ContractProbe key={identity} /></Suspense>}
      {admin && screen === 'p03' && P03LimitsProbe && <Suspense fallback={<p>Đang mở P0.3…</p>}><P03LimitsProbe key={identity} /></Suspense>}
    </div>
  );
}

export default function OnboardingPanel() {
  const { roomId, userId, userRoles } = usePrivosContext();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  if (!roomId) return <div className="container"><p className="loading-text">Mở app bên trong một room.</p></div>;
  const admin = isRoomAdmin(userRoles ?? []);
  if (import.meta.env.DEV && showDiagnostics) return <>
    <button type="button" onClick={() => setShowDiagnostics(false)}>Trở lại giao diện v4</button>
    <P0ProbeSurface key={probeSurfaceKey(roomId, userId, admin)} roomId={roomId} userId={userId} admin={admin} />
  </>;
  return (
    <>
      <V4Onboarding admin={admin} />
      {import.meta.env.DEV && <button className="v4-diagnostics-entry" type="button" onClick={() => setShowDiagnostics(true)}>Kiểm tra kỹ thuật P0</button>}
    </>
  );
}
