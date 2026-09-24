import { useReducer, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { getListInfo, listRoomLists } from '../data/onboarding-lists';
import { OptionalFeatureUnavailableError, PrivosRestError } from '../../privos-rest';
import { registryListInput } from '../domain/v2-registry-schema';
import { isRoomAdmin } from '../domain/roles';
import { aclQuery, aclUpdate, actorAllowed, assigneeIncludes, classifyAclResult, createRegistryIfVacant, createVerifiedFolder, fileLocation, fileMatches, folderMatches, hiddenTargetVerdict, itemFolderMatches, moveFileRequest, ordinaryField, updateMatches, uploadFileParams, uploadResultId } from './p0-contracts';
import { initialProbeSafety, probeSafetyReducer } from './probe-safety';
import { idOf, unwrapToolResult } from '../data/tool-result';

type Result = { label: string; state: string; evidence: string };
type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined; }
function stringAt(value: unknown, key: string): string | undefined { const found = record(value)?.[key]; return typeof found === 'string' ? found : undefined; }
function fieldsAt(value: unknown): { fieldId: string; value: unknown }[] | undefined {
  const fields = record(value)?.customFields;
  if (!Array.isArray(fields) || !fields.every((field) => typeof record(field)?.fieldId === 'string' && 'value' in (record(field) ?? {}))) return undefined;
  return fields.map((field) => ({ fieldId: stringAt(field, 'fieldId') ?? '', value: record(field)?.value }));
}
function codeAt(value: unknown): string { const code = stringAt(value, 'errorType'); return code && /^[a-z0-9_-]{1,80}$/i.test(code) ? code : 'none'; }

export default function P02ContractProbe() {
  const app = usePrivosApp();
  const { roomId, userId, userRoles } = usePrivosContext();
  const admin = isRoomAdmin(userRoles ?? []);
  const [safety, dispatchSafety] = useReducer(probeSafetyReducer, initialProbeSafety);
  const { confirmed, openUrl, downloadConfirmation } = safety;
  const setConfirmed = (value: boolean) => dispatchSafety({ type: 'confirm', value });
  const setOpenUrl = (value: string) => dispatchSafety({ type: 'open-url', value });
  const setDownloadConfirmation = (value: typeof downloadConfirmation) => dispatchSafety({ type: 'download-confirmation', value });
  const changeTarget = (setter: (value: string) => void, value: string) => { setter(value); dispatchSafety({ type: 'target-change' }); };
  const [busy, setBusy] = useState(false);
  const [positionListId, setPositionListId] = useState('');
  const [hireListId, setHireListId] = useState('');
  const [templateListId, setTemplateListId] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [itemId, setItemId] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [cUserId, setCUserId] = useState('');
  const [assigneeFieldId, setAssigneeFieldId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [rootFolderId, setRootFolderId] = useState('');
  const [roomFolderId, setRoomFolderId] = useState('');
  const [itemFolderId, setItemFolderId] = useState('');
  const [fileId, setFileId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  if (!roomId) return <p>Open the probe in a room.</p>;
  const room = roomId;
  const target = `room=${room}; positions=${positionListId || '-'}; hires=${hireListId || '-'}; template=${templateListId || '-'}; item=${itemId || (targetKey ? '[key supplied]' : '-')}; roomFolder=${roomFolderId || '-'}; file=${fileId || '-'}`;
  const report = (label: string, state: string, evidence: string) => setResults((current) => [{ label, state, evidence }, ...current].slice(0, 30));
  const sessionCan = (actor: 'B' | 'C') => actorAllowed(actor, userId, admin, assigneeId, cUserId);
  async function aclRead(listIdToRead: string, key: string): Promise<{ statusCode: number; body: JsonRecord }> {
    try {
      const payload = unwrapToolResult(await app.callServerTool(aclQuery(listIdToRead, key)));
      const page = record(payload);
      const items = Array.isArray(payload) ? payload : page?.items;
      if (!Array.isArray(items)) throw new Error('HUB_ACL_QUERY_MALFORMED');
      return { statusCode: 200, body: { ...page, success: true, items, count: items.length,
        nextCursor: page?.nextCursor ?? null } };
    } catch (error) {
      if (error instanceof PrivosRestError && error.statusCode === 403) return { statusCode: 403,
        body: { success: false, errorType: error.code } };
      throw error;
    }
  }
  async function listInRoom(listId: string): Promise<boolean> {
    return Boolean(listId && (await listRoomLists(app, room)).some((list) => list._id === listId));
  }
  async function readFolder(folderId: string, parentId?: string): Promise<JsonRecord | undefined> {
    const payload = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.folders.getByChannel',
      arguments: { channelId: room, limit: 100, ...(parentId ? { parentId } : {}) } }));
    const folders = Array.isArray(payload) ? payload : record(payload)?.folders;
    if (!Array.isArray(folders)) throw new Error('HUB_FOLDER_LIST_MALFORMED');
    const found = record(folders.find((folder) => idOf(folder) === folderId));
    return found ? { ...found, _id: folderId, channel_id: found.channel_id ?? found.channelId,
      father: found.father ?? found.parentId ?? null } : undefined;
  }
  async function readFile(fileIdToRead: string): Promise<{ statusCode: number; body: { success: true; file: JsonRecord } }> {
    // files:read — verify the exact linked file through the user's Hub session.
    const payload = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.files.get', arguments: { fileId: fileIdToRead } }));
    const file = record(record(payload)?.file ?? payload);
    if (!file || idOf(file) !== fileIdToRead) throw new Error('HUB_FILE_READBACK_MISMATCH');
    return { statusCode: 200, body: { success: true, file: { ...file, _id: fileIdToRead,
      channel_id: file.channel_id ?? file.channelId, folder_id: file.folder_id ?? file.folderId } } };
  }
  async function roomFolderValid(): Promise<boolean> {
    if (!rootFolderId || !roomFolderId || !positionId) return false;
    const root = await readFolder(rootFolderId);
    const child = await readFolder(roomFolderId, rootFolderId);
    return folderMatches(root, child, room, positionId);
  }
  async function perform(label: string, action: () => Promise<void>) {
    if (!confirmed || busy) return;
    setBusy(true);
    try { await action(); }
    catch (error) {
      if (error instanceof OptionalFeatureUnavailableError) report(label, 'unclassified-denial', `HTTP 403; verify installation grant versus item ACL; ${target}`);
      else if (error instanceof PrivosRestError) report(label, 'fail', `HTTP ${error.statusCode ?? 'unknown'}; code=${error.code && /^[a-z0-9_-]{1,80}$/i.test(error.code) ? error.code : 'none'}; ${target}`);
      else {
        const detail = error instanceof Error ? `${error.name}: ${error.message.replace(/[A-Za-z0-9]{24,}/g, '[redacted]').slice(0, 160)}` : 'non-Error rejection';
        report(label, 'bridge-failure', `${target}; ${detail}`);
      }
    }
    finally { setBusy(false); }
  }
  async function createRegistry(kind: 'positions' | 'hires') {
    await perform(`create-${kind}`, async () => {
      const input = registryListInput(room, kind);
      const outcome = await createRegistryIfVacant(app, room, kind);
      if (outcome.status === 'collision') { report(`create-${kind}`, 'registry-collision-stop', `room already has registry name/key; no POST sent; ${target}`); return; }
      const readback = await getListInfo(app, outcome.listId);
      const expected = input.fields.map((field) => `${field.name}:${field.type}`);
      const actual = readback.list.fieldDefinitions?.map((field) => `${field.name}:${field.type}`) ?? [];
      const stageNames = readback.stages.map((stage) => stage.name);
      const ok = await listInRoom(outcome.listId) && readback.list.key === input.key && readback.list.isolatedList === true && expected.every((field) => actual.includes(field)) &&
        JSON.stringify(stageNames) === JSON.stringify(input.stages.map((stage) => stage.name));
      if (kind === 'positions') changeTarget(setPositionListId, outcome.listId); else changeTarget(setHireListId, outcome.listId);
      report(`create-${kind}`, ok ? 'pass' : 'fail', `created ID recorded in field; schema readback ${ok ? 'matched' : 'mismatched'}; ${target}`);
    });
  }
  async function query(actor: 'B' | 'C', label: string, listId: string, key: string, expectation: 'allow' | 'deny') {
    await perform(label, async () => {
      if (!sessionCan(actor) || !listId || !key || actor === 'B' && !(await listInRoom(listId))) { report(label, 'invalid-session-or-target', target); return; }
      const response = await aclRead(listId, key);
      const rawVerdict = classifyAclResult(expectation, response.statusCode, response.body, key, expectation === 'allow' ? itemId || undefined : undefined);
      let verdict: string = actor === 'C' ? hiddenTargetVerdict(rawVerdict) : rawVerdict;
      const items = record(response.body)?.items;
      const found = Array.isArray(items) ? items[0] : undefined;
      const foundId = stringAt(found, '_id');
      if (label === 'B own item query' && verdict === 'pass') {
        if (!assigneeFieldId || !fieldsAt(found)?.some((field) => field.fieldId === assigneeFieldId && assigneeIncludes(field.value, userId))) verdict = 'fail';
        else if (foundId) changeTarget(setItemId, foundId);
      }
      report(label, verdict, `HTTP ${response.statusCode}; code=${codeAt(response.body)}; ${target}`);
    });
  }
  async function update(label: string, expectation: 'allow' | 'deny', targetFieldId: string, value: string) {
    await perform(label, async () => {
      if (!itemId || !hireListId || !targetKey || !targetFieldId || !value) { report(label, 'invalid-target', target); return; }
      if (expectation === 'deny' && !sessionCan('C') || label === 'B own item update' && !sessionCan('B') || label === 'A assign B' && !admin) {
        report(label, 'invalid-session', target); return;
      }
      if (expectation === 'deny') {
        if (!assigneeFieldId || targetFieldId === assigneeFieldId) { report(label, 'invalid-field-type', target); return; }
        // C must attempt the known ID directly; a denied query cannot provide a pre-write snapshot.
        try {
          unwrapToolResult(await app.callServerTool(aclUpdate(itemId, [{ fieldId: targetFieldId, value }])));
          report(label, 'fail', `tool write unexpectedly succeeded; ${target}`);
        } catch (error) {
          const status = error instanceof PrivosRestError ? error.statusCode : undefined;
          report(label, status === 403 ? 'unclassified-target' : 'fail', `tool HTTP ${status ?? 'unknown'}; ${target}`);
        }
        return;
      }
      if (!(await listInRoom(hireListId))) { report(label, 'target-list-not-in-room', target); return; }
      const defs = (await getListInfo(app, hireListId)).list.fieldDefinitions ?? [];
      if (label === 'A assign B' ? !defs.some((field) => field._id === targetFieldId && field.type === 'ASSIGNEE') : !ordinaryField(defs, targetFieldId)) {
        report(label, 'invalid-field-type', target); return;
      }
      const before = await aclRead(hireListId, targetKey);
      const beforeVerdict = classifyAclResult('allow', before.statusCode, before.body, targetKey, itemId);
      const items = record(before.body)?.items;
      const item = Array.isArray(items) ? items[0] : undefined;
      const fields = fieldsAt(item);
      if (beforeVerdict !== 'pass' || !fields || label === 'B own item update' && !fields.some((field) => field.fieldId === assigneeFieldId && assigneeIncludes(field.value, userId))) {
        report(label, 'precheck-failed', `HTTP ${before.statusCode}; code=${codeAt(before.body)}; ${target}`);
        return;
      }
      const next = [...fields.filter((field) => field.fieldId !== targetFieldId), { fieldId: targetFieldId, value }];
      unwrapToolResult(await app.callServerTool(aclUpdate(itemId, next)));
      const after = await aclRead(hireListId, targetKey);
      const afterItems = record(after.body)?.items;
      const updated = Array.isArray(afterItems) ? afterItems[0] : undefined;
      const current = fieldsAt(updated);
      const preserved = current && fields.every((field) => field.fieldId === targetFieldId || current.some((entry) => entry.fieldId === field.fieldId && JSON.stringify(entry.value) === JSON.stringify(field.value)));
      const matched = updateMatches(200, { success: true }, after.statusCode, after.body, targetKey, itemId, targetFieldId, value);
      report(label, matched && preserved ? 'pass' : 'fail', `tool update; readback=${after.statusCode}; ${target}`);
    });
  }
  async function createFolder(label: string, name: string, fatherId?: string) {
    await perform(label, async () => {
      if (!admin || !name || label === 'Create position folder' && (!fatherId || fatherId !== rootFolderId || !positionId)) { report(label, 'invalid-target', target); return; }
      const outcome = await createVerifiedFolder(app, room, name, fatherId);
      if (outcome.ok) {
        if (label === 'Create Onboarding folder') changeTarget(setRootFolderId, outcome.folderId);
        else changeTarget(setRoomFolderId, outcome.folderId);
      }
      report(label, outcome.ok ? 'pass' : 'fail', `folder ${outcome.ok ? 'readback matched' : outcome.reason}; ${target}`);
    });
  }
  async function fileInfo(actor: 'B' | 'C', label: string) {
    await perform(label, async () => {
      if (!sessionCan(actor) || !fileId || !(await roomFolderValid())) { report(label, 'invalid-session-or-target', target); return; }
      const response = await readFile(fileId);
      const metadata = record(record(response.body)?.file);
      const location = metadata ? fileLocation({ folder_id: stringAt(metadata, 'folder_id'), channel_id: stringAt(metadata, 'channel_id') }, room, roomFolderId, itemFolderId) : 'other';
      report(label, fileMatches(response.statusCode, response.body, fileId, room, roomFolderId) ? 'pass' : 'fail', `HTTP ${response.statusCode}; code=${codeAt(response.body)}; location=${location}; downloadUrl=${stringAt(metadata, 'downloadUrl') ? 'present' : 'absent'}; ${target}`);
    });
  }
  async function upload() {
    await perform('Upload to room folder', async () => {
      if (!admin || !file || file.size > 65536 || !(await roomFolderValid())) { report('Upload to room folder', 'invalid-target', target); return; }
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read failed')); reader.onerror = () => reject(new Error('read failed')); reader.readAsDataURL(file); });
      // files:write — upload into the verified room folder before linking an item.
      const result: unknown = await app.uploadFile(uploadFileParams(room, roomFolderId, file.name, dataUrl));
      const uploadedId = uploadResultId(result);
      const readback = uploadedId ? await readFile(uploadedId) : undefined;
      const ok = uploadedId && readback && fileMatches(readback.statusCode, readback.body, uploadedId, room, roomFolderId);
      if (ok && uploadedId) changeTarget(setFileId, uploadedId);
      report('Upload to room folder', ok ? 'pass' : 'fail', `SDK resolved; metadata readback ${ok ? 'matched' : 'mismatched'}; ${target}`);
    });
  }
  async function moveFile() {
    await perform('Move item file to room folder', async () => {
      if (!admin || !fileId || !itemFolderId || !itemId || !(await roomFolderValid())) { report('Move item file to room folder', 'invalid-target', target); return; }
      const sourceFolder = await readFolder(itemFolderId);
      if (!itemFolderMatches(sourceFolder, room, itemFolderId, itemId)) { report('Move item file to room folder', 'unverified-item-folder-binding', `public folder metadata has no verified itemId relation; ${target}`); return; }
      const before = await readFile(fileId);
      if (!fileMatches(before.statusCode, before.body, fileId, room, itemFolderId)) { report('Move item file to room folder', 'precheck-failed', `source file metadata mismatched; ${target}`); return; }
      unwrapToolResult(await app.callServerTool(moveFileRequest(fileId, roomFolderId)));
      const after = await readFile(fileId);
      const ok = fileMatches(after.statusCode, after.body, fileId, room, roomFolderId);
      if (ok) { setOpenUrl(''); setDownloadConfirmation('not-run'); }
      report('Move item file to room folder', ok ? 'pass' : 'fail', `tool move; readback HTTP ${after.statusCode}; ${target}`);
    });
  }
  async function prepareOpen() {
    await perform('Refresh download metadata', async () => {
      setOpenUrl(''); setDownloadConfirmation('not-run');
      if (!fileId || !(await roomFolderValid())) { report('Refresh download metadata', 'invalid-target', target); return; }
      const response = await readFile(fileId);
      const url = stringAt(record(response.body)?.file, 'downloadUrl');
      const ok = fileMatches(response.statusCode, response.body, fileId, room, roomFolderId) && Boolean(url && /^https:\/\//.test(url));
      if (ok && url) setOpenUrl(url);
      report('Refresh download metadata', ok ? 'ready-for-manual-open' : 'fail', `HTTP ${response.statusCode}; URL ${url ? 'present' : 'absent'}; ${target}`);
    });
  }

  return <section aria-label="P0.2 ACL and Files probe">
    <h2>P0.2 ACL and Files probe (dev)</h2><p>Current session only. Target: {target}</p>
    <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirm dedicated test room and target IDs</label>
    <h3>Registries and isolated items</h3>
    <label>Positions list ID <input value={positionListId} onChange={(event) => changeTarget(setPositionListId, event.target.value)} /></label>
    <label>Hires list ID <input value={hireListId} onChange={(event) => changeTarget(setHireListId, event.target.value)} /></label>
    <label>Template list ID <input value={templateListId} onChange={(event) => changeTarget(setTemplateListId, event.target.value)} /></label>
    {admin && <><button disabled={!confirmed || busy} onClick={() => void createRegistry('positions')}>A: create v2 positions registry</button><button disabled={!confirmed || busy} onClick={() => void createRegistry('hires')}>A: create v2 hires registry</button></>}
    <label>Known item key <input value={targetKey} onChange={(event) => changeTarget(setTargetKey, event.target.value)} /></label>
    <label>Template item key <input value={templateKey} onChange={(event) => changeTarget(setTemplateKey, event.target.value)} /></label>
    <label>Known item ID <input value={itemId} onChange={(event) => changeTarget(setItemId, event.target.value)} /></label>
    <label>Test update field ID <input value={fieldId} onChange={(event) => changeTarget(setFieldId, event.target.value)} /></label>
    <label>Test update text <input value={fieldValue} onChange={(event) => changeTarget(setFieldValue, event.target.value)} /></label>
    <label>ASSIGNEE field ID <input value={assigneeFieldId} onChange={(event) => changeTarget(setAssigneeFieldId, event.target.value)} /></label>
    <label>B user ID <input value={assigneeId} onChange={(event) => changeTarget(setAssigneeId, event.target.value)} /></label>
    <label>C user ID <input value={cUserId} onChange={(event) => changeTarget(setCUserId, event.target.value)} /></label>
    <p>Current account: {admin ? 'room owner/admin (A)' : userId === assigneeId && assigneeId !== cUserId ? 'B' : userId === cUserId && cUserId !== assigneeId ? 'C' : 'unmatched member'}. B/C results require their own distinct user IDs.</p>
    {admin && <button disabled={!confirmed || busy} onClick={() => void update('A assign B', 'allow', assigneeFieldId, assigneeId)}>A: assign B on item</button>}
    <button disabled={!confirmed || busy || !sessionCan('B')} onClick={() => void query('B', 'B own item query', hireListId, targetKey, 'allow')}>B: query own item</button>
    <button disabled={!confirmed || busy || !sessionCan('B')} onClick={() => void update('B own item update', 'allow', fieldId, fieldValue)}>B: update own item</button>
    <button disabled={!confirmed || busy || !sessionCan('B')} onClick={() => void query('B', 'B template denial', templateListId, templateKey, 'deny')}>B: query template (expect denied)</button>
    <button disabled={!confirmed || busy || !sessionCan('C')} onClick={() => void query('C', 'C known item denial', hireListId, targetKey, 'deny')}>C: query B item (expect denied)</button>
    <button disabled={!confirmed || busy || !sessionCan('C')} onClick={() => void update('C known item update denial', 'deny', fieldId, fieldValue)}>C: update B item (expect denied)</button>
    <h3>Room Files</h3>
    <label>Position ID <input value={positionId} onChange={(event) => changeTarget(setPositionId, event.target.value)} /></label>
    <label>Onboarding folder ID <input value={rootFolderId} onChange={(event) => changeTarget(setRootFolderId, event.target.value)} /></label>
    <label>Onboarding/position folder ID <input value={roomFolderId} onChange={(event) => changeTarget(setRoomFolderId, event.target.value)} /></label>
    <label>Item-owned folder ID <input value={itemFolderId} onChange={(event) => changeTarget(setItemFolderId, event.target.value)} /></label>
    <label>File ID <input value={fileId} onChange={(event) => changeTarget(setFileId, event.target.value)} /></label>
    {admin && <><button disabled={!confirmed || busy} onClick={() => void createFolder('Create Onboarding folder', 'Onboarding')}>A: create Onboarding folder</button><button disabled={!confirmed || busy || !rootFolderId} onClick={() => void createFolder('Create position folder', positionId, rootFolderId)}>A: create position folder</button><label>Small file, max 64 KiB <input type="file" onChange={(event) => { setFile(event.target.files?.[0] ?? null); dispatchSafety({ type: 'target-change' }); }} /></label><button disabled={!confirmed || busy} onClick={() => void upload()}>A: upload to room folder</button><button disabled={!confirmed || busy} onClick={() => void moveFile()}>A: move item file</button></>}
    <button disabled={!confirmed || busy || !sessionCan('B')} onClick={() => void fileInfo('B', 'B file metadata')}>B: read file metadata</button><button disabled={!confirmed || busy || !sessionCan('C')} onClick={() => void fileInfo('C', 'C file metadata')}>C: read file metadata</button>
    <button disabled={!confirmed || busy} onClick={() => void prepareOpen()}>Refresh download metadata</button>
    {openUrl && <><a href={openUrl} target="_blank" rel="noopener noreferrer" onClick={() => setDownloadConfirmation('not-run')}>Open or download test file</a><button onClick={() => setDownloadConfirmation('confirmed')}>I confirmed the file opened/downloaded</button><button onClick={() => setDownloadConfirmation('failed')}>Open/download failed</button></>}
    <p>Manual binary confirmation: {downloadConfirmation}. Opening a URL does not count as download PASS. Binary content is not read through app.rest.</p>
    <h3>Session results, IDs and status only</h3><ul>{results.map((result, index) => <li key={`${result.label}-${index}`}>{result.label}: {result.state}; {result.evidence}</li>)}</ul>
  </section>;
}
