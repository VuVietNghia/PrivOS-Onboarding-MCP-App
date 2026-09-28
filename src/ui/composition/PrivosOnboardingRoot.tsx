import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrivosApp, usePrivosContext, type McpApp } from '@privos_ai/app-react';
import { createLifetime } from '../../shared/lifetime';
import { createKeyedLock } from '../../shared/keyed-lock';
import { browserLocale, createBrowserEffects, createPrivosPreferences } from '../adapters/browser-effects';
import { createPrivosFiles } from '../onboarding/data/privos/files-adapter';
import { createPrivosLists } from '../onboarding/data/privos/lists-adapter';
import { createPrivosMembers } from '../onboarding/data/privos/members-adapter';
import { createRequestBudget } from '../onboarding/data/request-budget';
import { createPrivosBudgetEffects } from '../onboarding/data/privos/budget-effects';
import { resolveRoomBinding } from '../onboarding/data/room-bootstrap';
import type { RoomBootstrap } from '../onboarding/ports/bootstrap';
import type { ActorSession } from '../onboarding/ports/session';
import type { OnboardingServices } from '../onboarding/ports/ui-services';
import { createOnboardingServices, createSessionScope } from './create-onboarding-services';
import { sessionKey } from './session-key';

export interface OnboardingSessionState {
  key: string;
  actor: ActorSession;
  hostTheme: 'light' | 'dark';
  hostLocale: 'en' | 'vi';
  bootstrap: RoomBootstrap | null;
  services: OnboardingServices | null;
  error: unknown;
}

const SessionContext = createContext<OnboardingSessionState | null>(null);
function sharedBootstrap(app: McpApp, key: string, actor: ActorSession,
  pendingBootstraps: WeakMap<McpApp, Map<string, Promise<RoomBootstrap>>>): Promise<RoomBootstrap> {
  const perApp = pendingBootstraps.get(app) ?? new Map<string, Promise<RoomBootstrap>>();
  pendingBootstraps.set(app, perApp);
  const existing = perApp.get(key);
  if (existing) return existing;
  const lifetime = createLifetime();
  const effects = createBrowserEffects();
  const budget = createRequestBudget(createPrivosBudgetEffects(effects.clock, effects.scheduler));
  const lists = createPrivosLists(app, { lifetime, budget });
  const pending = resolveRoomBinding({ read: lists.read, lifecycle: lists.lifecycle }, actor)
    .finally(() => { lifetime.dispose(); budget.dispose(); });
  perApp.set(key, pending);
  void pending.finally(() => { if (perApp.get(key) === pending) perApp.delete(key); }).catch(() => {});
  return pending;
}

export function useOnboardingSession(): OnboardingSessionState | null {
  return useContext(SessionContext);
}

export function useOnboardingServices(): OnboardingServices {
  const session = useOnboardingSession();
  if (!session?.services) throw new Error('ONBOARDING_SERVICES_UNAVAILABLE');
  return session.services;
}

export function PrivosOnboardingRoot({ children }: { children: ReactNode }) {
  const app = usePrivosApp();
  const pendingBootstraps = useRef(new WeakMap<McpApp, Map<string, Promise<RoomBootstrap>>>());
  // basic:information supplies the verified room and user context for the session scope.
  const context = usePrivosContext();
  const rawRoomType: unknown = (context as typeof context & { roomType?: unknown }).roomType;
  const rawScopes: unknown = context.effectiveScopes;
  const actor: ActorSession = {
    roomId: context.roomId ?? '',
    roomType: rawRoomType === 'c' || rawRoomType === 'p' ? rawRoomType : 'unsupported',
    userId: context.userId ?? '',
    roles: context.userRoles ?? [],
    grantedScopes: Array.isArray(rawScopes) ? rawScopes.filter((scope): scope is string => typeof scope === 'string') : [],
  };
  const key = sessionKey(actor);
  const hostTheme: 'light' | 'dark' = context.theme === 'dark' ? 'dark' : 'light';
  const hostLocale = browserLocale();
  const [state, setState] = useState<OnboardingSessionState>({ key, actor, hostTheme, hostLocale, bootstrap: null, services: null, error: null });

  useEffect(() => {
    if (!actor.roomId || !actor.userId) return;
    let active = true;
    const lifetime = createLifetime();
    const effects = createBrowserEffects();
    const budget = createRequestBudget(createPrivosBudgetEffects(effects.clock, effects.scheduler));
    const lists = createPrivosLists(app, { lifetime, budget });
    const scope = createSessionScope({ actor, lifetime, budget,
      bootstrap: () => sharedBootstrap(app, key, actor, pendingBootstraps.current) });
    setState({ key, actor, hostTheme, hostLocale, bootstrap: null, services: null, error: null });
    void scope.bootstrap().then((bootstrap) => {
      if (!active) return;
      if (bootstrap.state !== 'ready') {
        setState({ key, actor, hostTheme, hostLocale, bootstrap, services: null, error: null });
        return;
      }
      const services = createOnboardingServices({ actor, binding: bootstrap.binding, lists,
        files: createPrivosFiles(app, actor.roomId, { links: effects.links, scheduler: effects.scheduler, lifetime }),
        members: createPrivosMembers(app, actor, lifetime),
        effects: { ...effects, preferences: createPrivosPreferences(app, ''), lock: createKeyedLock(lifetime) } });
      setState({ key, actor, hostTheme, hostLocale, bootstrap, services, error: null });
    }).catch((error: unknown) => { if (active) setState({ key, actor, hostTheme, hostLocale, bootstrap: null, services: null, error }); });
    return () => { active = false; scope.dispose(); };
  }, [app, key]);

  const current = state.key === key ? { ...state, hostTheme, hostLocale } : { key, actor, hostTheme, hostLocale, bootstrap: null, services: null, error: null };
  return <SessionContext.Provider value={current}>{children}</SessionContext.Provider>;
}
