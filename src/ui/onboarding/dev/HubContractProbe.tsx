import { useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import type { RestRequestParams } from '@privos_ai/app-react';
import { isRoomAdmin } from '../domain/roles';
import { buildQueryRequest, invalidateProbeSession, nextPageCursor, queryFields, sanitizeProbeData, validateProbeResponse } from './probe-results';
import type { ParentFilter, ProbeContext, ProbeResult } from './probe-results';
import { createItem, createList, getListInfo, listRoomLists, updateItem } from '../data/onboarding-lists';
import { idOf, unwrapToolResult } from '../data/tool-result';
import { PrivosRestError } from '../../privos-rest';
import { uploadResultId } from './p0-contracts';

type ProbeId = 'list-create' | 'list-info' | 'item-create' | 'items-query' | 'item-lookup' | 'field-update' | 'file-info' | 'file-upload' | 'stage-crud';
type ProbeRequest = Pick<RestRequestParams, 'method' | 'path' | 'query' | 'body'>;
const probeIds: readonly ProbeId[] = ['list-create', 'list-info', 'item-create', 'items-query', 'item-lookup', 'field-update', 'file-info', 'file-upload', 'stage-crud'];

function recordFor(id: ProbeId, results: readonly ProbeResult[]): ProbeResult {
  return results.find((result) => result.id === id) ?? { id, state: 'not-run' };
}

function errorCode(body: unknown): string | undefined {
  if (body !== null && typeof body === 'object' && 'errorType' in body && typeof body.errorType === 'string' && /^[a-z0-9_-]{1,80}$/i.test(body.errorType)) return body.errorType;
  return undefined;
}

function property(body: unknown, key: string): unknown {
  return body !== null && typeof body === 'object' ? Object.entries(body).find(([entryKey]) => entryKey === key)?.[1] : undefined;
}

function withId(value: unknown): Record<string, unknown> {
  const id = idOf(value);
  if (!id || value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('HUB_ID_MISSING');
  return { ...value, _id: id };
}

export default function HubContractProbe() {
  const app = usePrivosApp();
  const { roomId, userRoles } = usePrivosContext();
  const [consent, setConsent] = useState(false);
  const [listId, setListId] = useState('');
  const [listKey, setListKey] = useState('');
  const [stageId, setStageId] = useState('');
  const [parentId, setParentId] = useState('');
  const [parentMode, setParentMode] = useState<ParentFilter['mode']>('any');
  const [itemKey, setItemKey] = useState('');
  const [itemId, setItemId] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [nextCursor, setNextCursor] = useState<string>();
  const [fileId, setFileId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<ProbeResult[]>(probeIds.map((id) => ({ id, state: 'not-run' })));
  const [preview, setPreview] = useState('');
  const [capture, setCapture] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  if (!roomId || !isRoomAdmin(userRoles ?? [])) return <p>Chỉ owner/admin trong room thử nghiệm được mở probe.</p>;

  const setResult = (result: ProbeResult) => setResults((current) => current.map((entry) => entry.id === result.id ? result : entry));
  const resetTarget = () => {
    const reset = invalidateProbeSession({ generation: generation.current, consent, nextCursor, preview, capture, results });
    generation.current = reset.generation;
    setConsent(reset.consent);
    setNextCursor(reset.nextCursor);
    setPreview(reset.preview);
    setCapture(reset.capture);
    setResults(reset.results);
  };
  const target = `room=${roomId}; list=${listId || '(chưa chọn)'}`;
  const requestFor = (id: ProbeId, pageCursor?: string): ProbeRequest | undefined => {
    switch (id) {
      case 'list-create': case 'list-info': case 'item-create': case 'item-lookup': case 'field-update': case 'file-info': case 'file-upload': case 'stage-crud': return undefined;
      case 'items-query': return buildQueryRequest(listId, stageId, parentMode === 'children' ? { mode: 'children', parentId } : { mode: parentMode }, pageCursor);
    }
  };

  async function run(id: ProbeId, pageCursor?: string) {
    if (!consent || busy || id === 'stage-crud') return;
    if ((id === 'list-create' || id === 'list-info') && !listKey || (!['list-create', 'file-info', 'file-upload'].includes(id) && !listId) ||
      (id === 'item-create' && (!stageId || !itemKey || !fieldId || !assigneeId)) ||
      ((id === 'item-lookup' || id === 'field-update') && !itemId) ||
      (id === 'field-update' && (!fieldId || !assigneeId)) || (id === 'file-info' && !fileId) ||
      (id === 'items-query' && parentMode === 'children' && !parentId) ||
      (id === 'file-upload' && (!file || file.size > 65536))) return;
    setBusy(true);
    const runGeneration = generation.current;
    const request = requestFor(id, pageCursor);
    const context: ProbeContext = { listId, listKey, itemKey, stageId: id === 'items-query' || id === 'item-create' ? stageId : undefined,
      parentId: id === 'item-create' ? (parentId || null) : id === 'items-query' ? (parentMode === 'root' ? null : parentMode === 'children' ? parentId : undefined) : undefined,
      fieldId, assigneeId, fileId, fields: queryFields };
    setPreview(JSON.stringify({ operation: id, target, request: sanitizeProbeData(request ?? (id === 'file-upload'
      ? { channelId: roomId, fileName: file?.name, base64Data: '[redacted]' }
      : { tool: id, listId, itemId, stageId, fieldId })) }, null, 2));
    try {
      let body: unknown;
      let codeSource: unknown;
      let statusCode: number;
      let verifiedWrite = true;
      if (id === 'file-upload') {
        if (!file) throw new Error('no selected file');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('file read failed'));
          reader.onerror = () => reject(new Error('file read failed'));
          reader.readAsDataURL(file);
        });
        const upload: unknown = await app.uploadFile({ channelId: roomId, fileName: file.name, base64Data: dataUrl, duplicateAction: 'keep_both' });
        const uploadedId = uploadResultId(upload);
        if (!uploadedId) throw new Error('HUB_FILE_ID_MISSING');
        const fetched = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.files.get', arguments: { fileId: uploadedId } }));
        body = { success: true, file: withId(property(fetched, 'file') ?? fetched) };
        codeSource = fetched;
        statusCode = 200;
      } else if (id === 'list-create') {
        const name = `P0 probe ${listKey}`;
        const existing = await listRoomLists(app, roomId);
        if (existing.some((list) => list.key === listKey || list.name === name)) throw new Error('HUB_LIST_ALREADY_EXISTS');
        const created = await createList(app, { roomId, name, key: listKey, isolated: true,
          fields: [{ name: 'Probe date', type: 'DATE' }, { name: 'Probe checked', type: 'CHECKBOX' },
            { name: 'Probe choice', type: 'SELECT', options: ['One'] }, { name: 'Probe assignee', type: 'ASSIGNEE' },
            { name: 'Probe files', type: 'FILE_MULTIPLE' }],
          stages: [{ name: 'Week 1', color: '#3b82f6' }, { name: 'Week 2', color: '#22c55e' }],
        });
        const readback = await getListInfo(app, created._id);
        body = { success: true, list: created, readback: { success: true, ...readback } };
        codeSource = body;
        statusCode = 200;
        setListId(created._id);
      } else if (id === 'list-info') {
        const detail = await getListInfo(app, listId);
        body = { success: true, ...detail };
        codeSource = body;
        statusCode = 200;
      } else if (id === 'item-create') {
        const created = await createItem(app, { listId, name: itemKey, stageId,
          ...(parentId ? { parentId } : {}), customFields: [{ fieldId, value: assigneeId }] });
        body = { success: true, item: created, readback: { success: true, items: [created], count: 1, nextCursor: null } };
        codeSource = body;
        statusCode = 200;
        setItemId(created._id);
      } else if (id === 'item-lookup' || id === 'field-update') {
        const read = async () => {
          const payload = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.lists.getItem', arguments: { itemId } }));
          return withId(property(payload, 'item') ?? payload);
        };
        if (id === 'field-update') {
          const current = await read();
          if (idOf(current) !== itemId) throw new Error('HUB_ITEM_READBACK_MISMATCH');
          await updateItem(app, { itemId, customFields: [{ fieldId, value: assigneeId }] });
        }
        const item = await read();
        body = { success: true, items: [item], count: 1, nextCursor: null };
        codeSource = body;
        statusCode = 200;
      } else if (id === 'file-info') {
        const payload = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.files.get', arguments: { fileId } }));
        body = { success: true, file: withId(property(payload, 'file') ?? payload) };
        codeSource = body;
        statusCode = 200;
      } else {
        if (!request) return;
        const response = await app.rest(request);
        body = response.body;
        statusCode = response.statusCode;
        codeSource = response.body;
      }
      if (runGeneration !== generation.current) return;
      setCapture(JSON.stringify(sanitizeProbeData(body), null, 2));
      const code = errorCode(codeSource);
      const success = statusCode < 400 && verifiedWrite && validateProbeResponse(id, body, context);
      if (id === 'items-query') setNextCursor(success ? nextPageCursor(body) : undefined);
      setResult({ id, state: success ? 'pass' : 'fail', evidence: `${id === 'file-upload' ? 'SDK resolved' : `HTTP ${statusCode}`}; code=${code ?? 'none'}; ${target}`, checkedAt: new Date().toISOString() });
    } catch (error) {
      if (runGeneration !== generation.current) return;
      setCapture('');
      const evidence = error instanceof PrivosRestError
        ? `tool HTTP ${error.statusCode ?? 'unknown'}; code=${error.code && /^[a-z0-9_-]{1,80}$/i.test(error.code) ? error.code : 'none'}`
        : error instanceof Error && /^(no selected file|file read failed|HUB_[A-Z_]+)$/.test(error.message) ? error.message : 'bridge error';
      setResult({ id, state: 'fail', evidence, checkedAt: new Date().toISOString() });
    } finally { setBusy(false); }
  }

  return <section aria-label="Hub contract probe">
    <h2>Hub contract probe (dev)</h2>
    <p>Chỉ chạy trong room thử nghiệm. Mỗi nút chạy thao tác và lượt đọc kiểm chứng bằng phiên đăng nhập hiện tại.</p>
    <p>Đích: {target}</p>
    <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Xác nhận room/list này là dữ liệu thử</label>
    <div><label>List key mới <input value={listKey} onChange={(event) => { setListKey(event.target.value); resetTarget(); }} /></label></div>
    <div><label>List ID <input value={listId} onChange={(event) => { setListId(event.target.value); setStageId(''); setParentId(''); setItemKey(''); setFieldId(''); setAssigneeId(''); resetTarget(); }} /></label></div>
    <div><label>Stage ID <input value={stageId} onChange={(event) => { setStageId(event.target.value); resetTarget(); }} /></label></div>
    <div><label>Parent filter <select value={parentMode} onChange={(event) => { const value = event.target.value; if (value === 'any' || value === 'root' || value === 'children') { setParentMode(value); resetTarget(); } }}><option value="any">Any depth</option><option value="root">Root only</option><option value="children">Children of ID</option></select></label></div>
    <div><label>Parent item ID (also used for child creation) <input value={parentId} onChange={(event) => { setParentId(event.target.value); resetTarget(); }} /></label></div>
    <div><label>Item key <input value={itemKey} onChange={(event) => { setItemKey(event.target.value); resetTarget(); }} /></label></div>
    <div><label>ASSIGNEE field ID <input value={fieldId} onChange={(event) => { setFieldId(event.target.value); resetTarget(); }} /></label></div>
    <div><label>Assignee user ID <input value={assigneeId} onChange={(event) => { setAssigneeId(event.target.value); resetTarget(); }} /></label></div>
    <div><button type="button" disabled={!consent || busy || !nextCursor} onClick={() => void run('items-query', nextCursor)}>Next query page</button> {nextCursor ? 'Trang tiếp khả dụng' : 'Không có trang tiếp'}</div>
    <div><label>File ID <input value={fileId} onChange={(event) => { setFileId(event.target.value); resetTarget(); }} /></label></div>
    <div><label>Small test file (max 64 KiB) <input type="file" onChange={(event) => { setFile(event.target.files?.[0] ?? null); resetTarget(); }} /></label></div>
    <ul>{probeIds.map((id) => { const result = recordFor(id, results); return <li key={id}>
      <button type="button" disabled={!consent || busy || id === 'stage-crud'} onClick={() => void run(id)}>{id}</button>
      {' '}<strong>{result.state}</strong>{result.state !== 'not-run' && <> — {result.evidence} ({result.checkedAt})</>}
      {id === 'stage-crud' && ' — CHƯA XÁC MINH public route; không chạy'}
    </li>; })}</ul>
    <h3>Request preview (đã che giá trị)</h3><pre>{preview || 'Chưa chạy'}</pre>
    <h3>Response shape (tối đa 20 phần tử/mảng, đã che giá trị)</h3><pre>{capture || 'Chưa chạy'}</pre>
  </section>;
}
