import type { ReactNode } from 'react';
import { usePrivosApp, usePrivosContext, useProviderEmbed, type McpApp } from '@privos_ai/app-react';
import { createItem, createList, getListInfo, listRoomLists, updateItem } from '../data/onboarding-lists';
import type { ProbeEnvironment, ProbeTransport } from './probe-port';
import './probe-styles.css';

export function createPrivosProbeTransport(app: McpApp): ProbeTransport {
  return {
    rest: (request) => app.rest(request),
    callServerTool: (request) => app.callServerTool(request),
    uploadFile: (request) => app.uploadFile(request),
    listRoomLists: (roomId) => listRoomLists(app, roomId),
    getListInfo: (listId) => getListInfo(app, listId),
    createList: (input) => createList(app, input),
    createItem: (input) => createItem(app, input),
    updateItem: (input) => updateItem(app, input),
  };
}

function EmbedCheck({ url }: { url: string }) {
  const embed = useProviderEmbed(url);
  return <div><p>Host embed: {embed.state}{embed.reason ? `; reason=${embed.reason}` : ''}</p>
    <div ref={embed.ref} style={{ width: 320, height: 180, border: '1px solid currentColor' }} aria-label="Provider embed test placeholder" /></div>;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read failed'));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export default function PrivosProbeProvider({ children }: { children: (environment: ProbeEnvironment) => ReactNode }) {
  const app = usePrivosApp();
  const context = usePrivosContext();
  const effectiveScopes: unknown = context.effectiveScopes;
  const environment: ProbeEnvironment = {
    transport: createPrivosProbeTransport(app),
    actor: { roomId: context.roomId ?? '', userId: context.userId ?? '', roles: context.userRoles ?? [],
      effectiveScopes: Array.isArray(effectiveScopes) ? effectiveScopes.filter((scope): scope is string => typeof scope === 'string') : [] },
    nowIso: () => new Date().toISOString(), nowMs: () => performance.now(),
    hostLanguage: navigator.language, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    readDataUrl, EmbedCheck,
  };
  return <>{children(environment)}</>;
}
