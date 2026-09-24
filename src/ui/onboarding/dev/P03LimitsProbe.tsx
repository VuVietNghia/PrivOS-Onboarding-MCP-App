import { useState } from 'react';
import { usePrivosApp, usePrivosContext, useProviderEmbed } from '@privos_ai/app-react';
import { getListInfo, listRoomLists, updateItem } from '../data/onboarding-lists';
import { isRoomAdmin } from '../domain/roles';
import { folderMatches, uploadFileParams, uploadResultId } from './p0-contracts';
import { idOf, unwrapToolResult } from '../data/tool-result';
import { approvedFileSize, buildScoreWrite, buildTextWrite, fileSizeVerified, pageAdvanceValid, pageQueryRequest, parsePage, parseSnapshot, searchRequest, snapshotQueryRequest, verifiedUploadFileId, type Snapshot } from './p03-contracts';

type Result = { label: string; state: string; evidence: string };
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function providerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['www.youtube-nocookie.com', 'player.vimeo.com', 'drive.google.com'].includes(url.hostname);
  } catch { return false; }
}
function EmbedCheck({ url }: { url: string }) {
  const embed = useProviderEmbed(url);
  return <div><p>Host embed: {embed.state}{embed.reason ? `; reason=${embed.reason}` : ''}</p>
    <div ref={embed.ref} style={{ width: 320, height: 180, border: '1px solid currentColor' }} aria-label="Provider embed test placeholder" /></div>;
}

export default function P03LimitsProbe() {
  const app = usePrivosApp();
  const { roomId, userId, userRoles, effectiveScopes } = usePrivosContext();
  const admin = isRoomAdmin(userRoles ?? []);
  const [confirmed, setConfirmed] = useState(false);
  const [listId, setListId] = useState('');
  const [itemId, setItemId] = useState('');
  const [itemKey, setItemKey] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [bytes, setBytes] = useState(3072);
  const [marker, setMarker] = useState('');
  const [score, setScore] = useState(80);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [snapshotAt, setSnapshotAt] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [embedInput, setEmbedInput] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [searchText, setSearchText] = useState('Chăm sóc');
  const [pageSize, setPageSize] = useState(50);
  const [cursor, setCursor] = useState<string>();
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [seenCursors, setSeenCursors] = useState<string[]>([]);
  const [positionId, setPositionId] = useState('');
  const [rootFolderId, setRootFolderId] = useState('');
  const [positionFolderId, setPositionFolderId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [approvedKiB, setApprovedKiB] = useState(1024);
  const [approvedFixture, setApprovedFixture] = useState(false);
  const target = `room=${roomId}; list=${listId || '-'}; item=${itemId || '-'}; key=${itemKey ? '[entered]' : '-'}; field=${fieldId || '-'}`;
  const report = (label: string, state: string, evidence: string) => setResults((old) => [{ label, state, evidence }, ...old].slice(0, 25));
  const change = (setter: (value: string) => void, value: string) => {
    setter(value); setConfirmed(false); setSnapshot(undefined); setSnapshotAt(''); setCursor(undefined); setSeenIds([]); setSeenCursors([]); setEmbedUrl(''); setApprovedFixture(false);
  };
  async function within(label: string, action: () => Promise<void>) {
    if (!confirmed || busy || !admin || !roomId) return;
    setBusy(true);
    try { await action(); } catch { report(label, 'fail', `bridge/validation error; ${target}`); }
    finally { setBusy(false); }
  }
  async function verifyTarget(requireField: boolean): Promise<boolean> {
    if (!listId || !itemId || !itemKey || requireField && !fieldId) return false;
    const lists = await listRoomLists(app, roomId);
    if (!lists.some((list) => list._id === listId)) return false;
    const info = await getListInfo(app, listId);
    return !requireField || Boolean(info.list.fieldDefinitions?.some((field) => field._id === fieldId && field.type === 'TEXTAREA'));
  }
  const readRequest = () => snapshotQueryRequest(listId, itemKey);
  async function read(label = 'Read fixture snapshot') {
    await within(label, async () => {
      setSnapshot(undefined);
      if (!(await verifyTarget(true))) { report(label, 'invalid-target', target); return; }
      const response = await app.rest(readRequest());
      const next = parseSnapshot(response.statusCode, response.body, itemId, itemKey);
      if (next) { setSnapshot(next); setSnapshotAt(new Date().toISOString()); }
      const raw = next?.fields.find((field) => field.fieldId === fieldId)?.value;
      let markers = 'unavailable';
      if (typeof raw === 'string') {
        try {
          const parsed = record(JSON.parse(raw));
          markers = Object.keys(record(parsed?.p0ProbeScores) ?? {}).filter((key) => /^[a-z0-9_-]{1,32}$/i.test(key)).join(',') || 'none';
        } catch { markers = 'invalid-json'; }
      }
      report(label, next ? 'read' : 'fail', `HTTP ${response.statusCode}; score markers=${markers}; ${target}`);
    });
  }
  async function writeText() {
    await within('Bounded TEXTAREA write', async () => {
      if (!snapshot || !(await verifyTarget(true))) { report('Bounded TEXTAREA write', 'invalid-target', target); return; }
      const request = buildTextWrite(snapshot, fieldId, bytes);
      if (!request) { report('Bounded TEXTAREA write', 'invalid-size', `cap=8192 bytes; ${target}`); return; }
      await updateItem(app, { itemId, customFields: request.customFields });
      const readback = await app.rest(readRequest());
      const next = readback ? parseSnapshot(readback.statusCode, readback.body, itemId, itemKey) : undefined;
      const expected = request.customFields.find((field) => field.fieldId === fieldId)?.value;
      const preserved = snapshot.fields.every((field) => field.fieldId === fieldId ||
        next?.fields.some((entry) => entry.fieldId === field.fieldId && JSON.stringify(entry.value) === JSON.stringify(field.value)));
      const ok = preserved && next?.fields.find((field) => field.fieldId === fieldId)?.value === expected;
      setSnapshot(undefined);
      report('Bounded TEXTAREA write', ok ? 'readback-match' : 'fail', `tool write; readback HTTP ${readback.statusCode}; bytes=${bytes}; ${target}`);
    });
  }
  async function writeScore() {
    await within('Two-tab score write', async () => {
      if (!snapshot || !(await verifyTarget(true))) { report('Two-tab score write', 'invalid-target', target); return; }
      const request = buildScoreWrite(snapshot, fieldId, marker, score);
      if (!request) { report('Two-tab score write', 'invalid-json-or-size', `cap=8192 bytes; ${target}`); return; }
      await updateItem(app, { itemId, customFields: request.customFields });
      const readback = await app.rest(readRequest());
      const next = readback ? parseSnapshot(readback.statusCode, readback.body, itemId, itemKey) : undefined;
      const expected = request.customFields.find((field) => field.fieldId === fieldId)?.value;
      const preserved = snapshot.fields.every((field) => field.fieldId === fieldId ||
        next?.fields.some((entry) => entry.fieldId === field.fieldId && JSON.stringify(entry.value) === JSON.stringify(field.value)));
      const ok = preserved && next?.fields.find((field) => field.fieldId === fieldId)?.value === expected;
      const size = typeof expected === 'string' ? new TextEncoder().encode(expected).length : 0;
      setSnapshot(undefined);
      report('Two-tab score write', ok ? 'immediate-readback-match' : 'fail', `tool write; readback HTTP ${readback.statusCode}; bytes=${size}; marker=${marker}; snapshot=${snapshotAt}; ${target}`);
    });
  }
  async function search() {
    await within('Accent search', async () => {
      if (!listId || !(await listRoomLists(app, roomId)).some((list) => list._id === listId)) { report('Accent search', 'invalid-target', target); return; }
      const response = await app.rest(searchRequest(listId, searchText));
      const page = record(response.body);
      const keys = Array.isArray(page?.items) ? page.items.map((item) => record(item)?.key).filter((key): key is string => typeof key === 'string') : [];
      report('Accent search', response.statusCode < 400 && page?.success === true && Array.isArray(page.items) ? 'measured' : 'fail',
        `HTTP ${response.statusCode}; term=${searchText}; matched fixture key=${keys.includes(itemKey)}; rows=${keys.length}; ${target}`);
    });
  }
  async function readPage() {
    await within('Bounded tree page', async () => {
      if (!listId || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200 ||
        !(await listRoomLists(app, roomId)).some((list) => list._id === listId)) { report('Bounded tree page', 'invalid-target', target); return; }
      const start = performance.now();
      const response = await app.rest(pageQueryRequest(listId, pageSize, cursor));
      const elapsed = Math.round(performance.now() - start);
      const page = parsePage(response.statusCode, response.body, pageSize);
      const valid = Boolean(page && pageAdvanceValid(page, seenIds, seenCursors, cursor));
      if (page && valid) {
        setSeenIds((old) => [...old, ...page.ids]);
        setCursor(page.nextCursor);
        setSeenCursors(page.nextCursor ? [...seenCursors, page.nextCursor] : []);
      } else { setCursor(undefined); setSeenIds([]); setSeenCursors([]); }
      report('Bounded tree page', valid ? 'measured' : 'contract-failure', `HTTP ${response.statusCode}; requested=${pageSize}; returned=${page?.ids.length ?? 'invalid'}; elapsedMs=${elapsed}; next=${Boolean(page?.nextCursor)}; ${target}`);
    });
  }
  async function uploadRepresentativeFile() {
    await within('Representative file upload', async () => {
      if (!approvedFixture || !file || !positionId || !rootFolderId || !positionFolderId ||
        !approvedFileSize(file.size, approvedKiB, file.type)) {
        report('Representative file upload', 'invalid-fixture-or-cap', `approvedKiB=${approvedKiB}; ${target}`); return;
      }
      const folderAt = async (folderId: string, parentId?: string) => {
        const payload = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.folders.getByChannel',
          arguments: { channelId: roomId, limit: 100, ...(parentId ? { parentId } : {}) } }));
        const folders = Array.isArray(payload) ? payload : record(payload)?.folders;
        if (!Array.isArray(folders)) throw new Error('HUB_FOLDER_LIST_MALFORMED');
        const found = record(folders.find((entry) => idOf(entry) === folderId));
        return found ? { ...found, _id: folderId, channel_id: found.channel_id ?? found.channelId,
          father: found.father ?? found.parentId ?? null } : undefined;
      };
      const rootFolder = await folderAt(rootFolderId);
      const positionFolder = await folderAt(positionFolderId, rootFolderId);
      if (!folderMatches(rootFolder, positionFolder, roomId, positionId)) {
        report('Representative file upload', 'invalid-folder-binding', `folder tool readback mismatched; ${target}`); return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read failed'));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const started = performance.now();
      const outcome: unknown = await app.uploadFile(uploadFileParams(roomId, positionFolderId, file.name, dataUrl));
      const elapsed = Math.round(performance.now() - started);
      const uploadedId = uploadResultId(outcome);
      const filePayload = uploadedId ? unwrapToolResult(await app.callServerTool({ name: 'mcpapp.files.get', arguments: { fileId: uploadedId } })) : undefined;
      const rawFile = record(record(filePayload)?.file ?? filePayload);
      const readback = uploadedId && rawFile && idOf(rawFile) === uploadedId ? { statusCode: 200, body: { success: true,
        file: { ...rawFile, _id: uploadedId, channel_id: rawFile.channel_id ?? rawFile.channelId,
          folder_id: rawFile.folder_id ?? rawFile.folderId, file_size: rawFile.file_size ?? rawFile.fileSize } } } : undefined;
      const verifiedId = readback ? verifiedUploadFileId(uploadedId, readback.statusCode, readback.body, roomId, positionFolderId) : undefined;
      const locationOk = Boolean(verifiedId);
      const sizeOk = Boolean(readback && fileSizeVerified(readback.statusCode, readback.body, file.size));
      const metadataSize = record(record(readback?.body)?.file)?.file_size;
      setApprovedFixture(false);
      report('Representative file upload', locationOk && sizeOk ? 'readback-match' : locationOk ? 'size-unverified' : 'fail',
        `verifiedFileId=${verifiedId ?? '-'}; bytes=${file.size}; metadataBytes=${typeof metadataSize === 'number' ? metadataSize : 'absent'}; mime=${file.type}; approvedKiB=${approvedKiB}; uploadMs=${elapsed}; metadata HTTP ${readback?.statusCode ?? '-'}; roomFolder=${positionFolderId}; ${target}`);
    });
  }
  if (!admin) return <p>P0.3 limit probe requires a room owner/admin.</p>;
  return <section aria-label="P0.3 limits probe">
    <h2>P0.3 limits and concurrency probe (dev)</h2>
    <p>Current session {userId}; {target}. Only a dedicated test fixture. Every request requires a click.</p>
    <p>Host context has no locale field in installed SDK; browser language={navigator.language}; time zone={Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    <p>Optional scopes: rooms:read={effectiveScopes?.includes('rooms:read') ? 'granted' : 'not reported'}; users:read={effectiveScopes?.includes('users:read') ? 'granted' : 'not reported'}.</p>
    <label>Test list ID <input value={listId} onChange={(event) => change(setListId, event.target.value)} /></label>
    <label>Test item ID <input value={itemId} onChange={(event) => change(setItemId, event.target.value)} /></label>
    <label>Test item key <input value={itemKey} onChange={(event) => change(setItemKey, event.target.value)} /></label>
    <label>Verified TEXTAREA field ID <input value={fieldId} onChange={(event) => change(setFieldId, event.target.value)} /></label>
    <label><input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); if (!event.target.checked) { setEmbedUrl(''); setApprovedFixture(false); } }} /> Confirm current room and all entered targets are disposable test data</label>
    <h3>Read and bounded write</h3>
    <button disabled={!confirmed || busy} onClick={() => void read()}>Read snapshot</button>
    <p>Captured snapshot: {snapshotAt || 'none'}. Writes use this snapshot and clear it after a request.</p>
    <label>TEXTAREA bytes (1–8192) <input type="number" min={1} max={8192} value={bytes} onChange={(event) => setBytes(Number(event.target.value))} /></label>
    <button disabled={!confirmed || busy || !snapshot} onClick={() => void writeText()}>Write bounded test text</button>
    <label>Unique tab marker (letters/numbers/_/-) <input value={marker} onChange={(event) => setMarker(event.target.value)} /></label>
    <label>Score 0–100 <input type="number" min={0} max={100} value={score} onChange={(event) => setScore(Number(event.target.value))} /></label>
    <button disabled={!confirmed || busy || !snapshot} onClick={() => void writeScore()}>Write score marker from captured snapshot</button>
    <h3>Search and one bounded page</h3>
    <label>Search phrase <input value={searchText} onChange={(event) => setSearchText(event.target.value)} /></label>
    <button disabled={!confirmed || busy} onClick={() => void search()}>Query text once</button>
    <label>Page size (1–200) <input type="number" min={1} max={200} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCursor(undefined); setSeenIds([]); setSeenCursors([]); }} /></label>
    <button disabled={!confirmed || busy} onClick={() => void readPage()}>{cursor ? 'Read next page once' : 'Read first page once'}</button>
    <button disabled={!confirmed || busy} onClick={() => { setCursor(undefined); setSeenIds([]); setSeenCursors([]); }}>Reset cursor</button>
    <p>Unique IDs seen in this walk: {seenIds.length}. Cursor is memory only; mutation during a walk requires reset.</p>
    <h3>Representative room file size, one upload per click</h3>
    <label>Position ID <input value={positionId} onChange={(event) => change(setPositionId, event.target.value)} /></label>
    <label>Onboarding root folder ID <input value={rootFolderId} onChange={(event) => change(setRootFolderId, event.target.value)} /></label>
    <label>Onboarding/position folder ID <input value={positionFolderId} onChange={(event) => change(setPositionFolderId, event.target.value)} /></label>
    <label>Approved size cap KiB (1–8192) <input type="number" min={1} max={8192} value={approvedKiB} onChange={(event) => { setApprovedKiB(Number(event.target.value)); setApprovedFixture(false); }} /></label>
    <label>Approved test PDF/PNG/JPEG <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setApprovedFixture(false); }} /></label>
    <p>Selected size: {file?.size ?? 0} bytes; upload maximum: 8 MiB. File bytes are read only after clicking upload.</p>
    <label><input type="checkbox" checked={approvedFixture} onChange={(event) => setApprovedFixture(event.target.checked)} /> I approve this exact test file and size for the dedicated room</label>
    <button disabled={!confirmed || !approvedFixture || busy || !file || !approvedFileSize(file.size, approvedKiB, file.type)} onClick={() => void uploadRepresentativeFile()}>Upload approved representative file once</button>
    <h3>Host provider embed</h3>
    <label>Approved HTTPS provider URL <input value={embedInput} onChange={(event) => { setEmbedInput(event.target.value); setEmbedUrl(''); }} /></label>
    <button disabled={!confirmed || !providerUrl(embedInput)} onClick={() => setEmbedUrl(embedInput)}>Request embed</button>
    <button disabled={!embedUrl} onClick={() => setEmbedUrl('')}>Release embed</button>
    {embedUrl && <EmbedCheck key={embedUrl} url={embedUrl} />}
    <h3>Session evidence, no document content</h3><ul>{results.map((result, index) => <li key={`${result.label}-${index}`}>{result.label}: {result.state}; {result.evidence}</li>)}</ul>
  </section>;
}
