import type { ReactNode } from 'react';
import type { ProbeEnvironment } from '../../src/ui/onboarding/dev/probe-port';
import '../../src/ui/onboarding/dev/probe-styles.css';

const unused = async (): Promise<never> => { throw new Error('FIXTURE_PROBE_ACTION_DISABLED'); };
const probe: ProbeEnvironment = {
  transport: { rest: unused, callServerTool: unused, uploadFile: unused, listRoomLists: unused,
    getListInfo: unused, createList: unused, createItem: unused, updateItem: unused },
  actor: { roomId: 'theme-regression-fixture', userId: 'fixture-member', roles: [], effectiveScopes: [] },
  nowIso: () => '2026-09-30T00:00:00.000Z', nowMs: () => 0,
  hostLanguage: 'en', timeZone: 'Asia/Saigon', readDataUrl: unused,
  EmbedCheck: () => <div>Fixture embed</div>,
};

export default function MemberProbeProvider({ children }: { children: (environment: ProbeEnvironment) => ReactNode }) {
  return <>{children(probe)}</>;
}
