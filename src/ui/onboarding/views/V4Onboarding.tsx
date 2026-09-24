import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { createCatalogs, type Catalogs } from '../data/catalogs';
import { createFilesGateway } from '../data/files';
import { saveTemplateV4 } from '../flows/save-template-v4';
import { createHrV4Actions, createMcpHrV4Gateway } from '../flows/hr-v4';
import { resolveRoomBinding, type RoomBootstrap } from '../data/room-bootstrap';
import { describeError } from '../domain/errors';
import type { HireStatus, Position, PositionStatus, TemplateTree } from '../domain/models';
import { selectTemplate, type CopySelection } from '../domain/select-template';
import { HiresCatalogTable, PositionsCatalogTable } from './V4CatalogTables';
import { OnboardingShell, type OnboardingLocale, type OnboardingScreen, type OnboardingTheme } from './OnboardingShell';
import { TemplateBuilder } from './templates/TemplateBuilder';
import { CopyTemplateDialog, type CopySource } from './templates/CopyTemplateDialog';
import { ImportFolderPanel } from './templates/ImportFolderPanel';
import { ProvisionV4Form } from './ProvisionV4Form';
import { HrV4Drawer } from './HrV4Drawer';
import { EmployeeRoadmapScreen } from './learning/EmployeeRoadmapScreen';
import { useCatalogPage } from './use-catalog-page';
import { translateV4Error, v4CatalogCopy } from './v4-catalog-copy';

function initialLocale(): OnboardingLocale {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'vi';
}

function useDebouncedText(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

function HiresScreen({ catalogs, identityKey, locale, onCreate, onOpen }: { catalogs: Catalogs; identityKey: string; locale: OnboardingLocale; onCreate: () => void; onOpen: (hireId: string) => void }) {
  const [search, setSearch] = useState('');
  const query = useDebouncedText(search);
  const [status, setStatus] = useState<HireStatus | 'all'>('all');
  const [positionQuery, setPositionQuery] = useState('');
  const debouncedPositionQuery = useDebouncedText(positionQuery);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [positionLookupOpen, setPositionLookupOpen] = useState(false);
  const [positionOptions, setPositionOptions] = useState<Position[]>([]);
  const [positionLookupLoading, setPositionLookupLoading] = useState(false);
  const [positionLookupError, setPositionLookupError] = useState<string | null>(null);
  const lookupRevision = useRef(0);

  useEffect(() => {
    if (!positionLookupOpen || selectedPosition || positionQuery !== debouncedPositionQuery) return;
    let active = true;
    const revision = lookupRevision.current;
    setPositionLookupLoading(true);
    setPositionLookupError(null);
    void catalogs.positions({ text: debouncedPositionQuery }).then((result) => {
      if (active && revision === lookupRevision.current) setPositionOptions(result.items);
    }).catch((error: unknown) => {
      if (active && revision === lookupRevision.current) setPositionLookupError(describeError(error).message);
    }).finally(() => {
      if (active && revision === lookupRevision.current) setPositionLookupLoading(false);
    });
    return () => { active = false; };
  }, [catalogs, positionQuery, debouncedPositionQuery, positionLookupOpen, selectedPosition]);

  const changePositionQuery = (value: string) => {
    lookupRevision.current += 1;
    setPositionQuery(value);
    setSelectedPosition(null);
    setPositionOptions([]);
    setPositionLookupError(null);
    setPositionLookupLoading(true);
    setPositionLookupOpen(true);
  };
  const clearPosition = () => {
    lookupRevision.current += 1;
    setPositionQuery('');
    setSelectedPosition(null);
    setPositionOptions([]);
    setPositionLookupError(null);
    setPositionLookupOpen(false);
  };
  const selectPosition = (position: Position) => {
    lookupRevision.current += 1;
    setSelectedPosition(position);
    setPositionQuery(position.name);
    setPositionLookupOpen(false);
  };
  const load = useCallback((cursor?: string) => catalogs.hires({ text: query, ...(status !== 'all' ? { status } : {}), ...(selectedPosition ? { positionId: selectedPosition.id } : {}) }, cursor), [catalogs, query, status, selectedPosition]);
  const page = useCatalogPage(JSON.stringify([identityKey, 'hires', query, status, selectedPosition?.id ?? null]), load);
  return <HiresCatalogTable {...page} locale={locale} search={search} onSearch={setSearch} status={status} onStatus={setStatus} onPrevious={page.previous} onNext={page.next} onReload={page.reload} onCreate={onCreate} onOpen={(hire) => onOpen(hire.id)} positionQuery={positionQuery} selectedPosition={selectedPosition} positionOptions={positionOptions} positionLookupOpen={positionLookupOpen} positionLookupLoading={positionLookupLoading} positionLookupError={positionLookupError} onPositionQuery={changePositionQuery} onPositionFocus={() => { if (!selectedPosition) { lookupRevision.current += 1; setPositionLookupLoading(true); setPositionLookupOpen(true); } }} onPositionSelect={selectPosition} onPositionClear={clearPosition} onPositionClose={() => setPositionLookupOpen(false)} />;
}

function PositionsScreen({ catalogs, identityKey, locale, onCreate, onOpen, onCopy, onDisable }: { catalogs: Catalogs; identityKey: string; locale: OnboardingLocale; onCreate: () => void; onOpen: (position: Position) => void; onCopy: (position: Position) => void; onDisable: (position: Position) => void }) {
  const [search, setSearch] = useState('');
  const query = useDebouncedText(search);
  const [status, setStatus] = useState<PositionStatus | 'all'>('all');
  const load = useCallback((cursor?: string) => catalogs.positions({ text: query, ...(status !== 'all' ? { status } : {}) }, cursor), [catalogs, query, status]);
  const page = useCatalogPage(JSON.stringify([identityKey, 'positions', query, status]), load);
  return <PositionsCatalogTable {...page} locale={locale} search={search} onSearch={setSearch} status={status} onStatus={setStatus} onPrevious={page.previous} onNext={page.next} onReload={page.reload} onCreate={onCreate} onOpen={onOpen} onCopy={onCopy} onDisable={onDisable} />;
}

function UnconfiguredScreen({ screen, message, locale }: { screen: OnboardingScreen; message: string; locale: OnboardingLocale }) {
  const [hireSearch, setHireSearch] = useState('');
  const [positionSearch, setPositionSearch] = useState('');
  const [hireStatus, setHireStatus] = useState<HireStatus | 'all'>('all');
  const [positionStatus, setPositionStatus] = useState<PositionStatus | 'all'>('all');
  const t = v4CatalogCopy(locale);
  if (screen === 'templates') return <PositionsCatalogTable locale={locale} items={[]} loading={false} error={message} search={positionSearch} onSearch={setPositionSearch} status={positionStatus} onStatus={setPositionStatus} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} />;
  if (screen === 'hires') return <HiresCatalogTable locale={locale} items={[]} loading={false} error={message} search={hireSearch} onSearch={setHireSearch} status={hireStatus} onStatus={setHireStatus} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} />;
  return <section className="v4-screen"><h1>{screen === 'roadmap' ? t.roadmapTitle : t.createOnboarding}</h1><p role="status">{message}</p></section>;
}

export function V4Onboarding({ admin }: { admin: boolean }) {
  const app = usePrivosApp();
  const { roomId, userId, userRoles, theme: hostTheme } = usePrivosContext();
  const role = admin ? 'admin' : 'employee';
  const [screen, setScreen] = useState<OnboardingScreen>(admin ? 'hires' : 'roadmap');
  const [templateEditor, setTemplateEditor] = useState<{ key: string; positionId?: string; tree: TemplateTree; name: string; status: 'draft' | 'ready' | 'disabled' } | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [copySource, setCopySource] = useState<CopySource | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [selectedHireId, setSelectedHireId] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<Position | null>(null);
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [locale, setLocale] = useState<OnboardingLocale>(initialLocale);
  const [theme, setTheme] = useState<OnboardingTheme>(hostTheme === 'dark' ? 'dark' : 'light');
  const identityKey = JSON.stringify([roomId, userId ?? null, role]);
  const [bootstrap, setBootstrap] = useState<{ key: string; result: RoomBootstrap | null; error: string | null }>({ key: identityKey, result: null, error: null });

  useEffect(() => { setScreen(admin ? 'hires' : 'roadmap'); setTemplateEditor(null); setSelectedHireId(null); setCopySource(null); setImportOpen(false); }, [admin, roomId, userId]);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLocale(initialLocale());
    setTheme(hostTheme === 'dark' ? 'dark' : 'light');
    void Promise.all([app.storage.get(`ui:language:${userId}`), app.storage.get(`ui:theme:${userId}`)]).then(([savedLocale, savedTheme]) => {
      if (!active) return;
      if (savedLocale === 'vi' || savedLocale === 'en') setLocale(savedLocale);
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'brand') setTheme(savedTheme);
    }).catch(() => {});
    return () => { active = false; };
  }, [app, userId, hostTheme]);

  useEffect(() => {
    let active = true;
    setBootstrap({ key: identityKey, result: null, error: null });
    if (!roomId || !userId) return () => { active = false; };
    void resolveRoomBinding(app, roomId, { userId, canManage: admin }).then((result) => {
      if (active) setBootstrap({ key: identityKey, result, error: null });
    }).catch((error: unknown) => {
      if (active) setBootstrap({ key: identityKey, result: null, error: describeError(error).message });
    });
    return () => { active = false; };
  }, [app, roomId, userId, admin, identityKey]);
  const bindingState = bootstrap.key === identityKey ? bootstrap : { key: identityKey, result: null, error: null };
  const binding = bindingState.result?.state === 'ready' ? bindingState.result.binding : null;
  const catalogs = useMemo(() => admin && binding ? createCatalogs(app, binding) : null, [app, admin, binding]);
  const filesGateway = useMemo(() => roomId ? createFilesGateway(app, roomId) : null, [app, roomId]);
  const t = v4CatalogCopy(locale);
  const bootstrapMessage = bindingState.error ? translateV4Error(bindingState.error, locale)
    : bindingState.result?.state === 'needs-admin' ? t.needsAdmin
    : bindingState.result?.state === 'blocked' ? t[bindingState.result.code]
    : bindingState.result ? t.unavailable : t.loading;
  const changeLocale = (next: OnboardingLocale) => { setLocale(next); if (userId) void app.storage.set(`ui:language:${userId}`, next).catch(() => {}); };
  const changeTheme = (next: OnboardingTheme) => { setTheme(next); if (userId) void app.storage.set(`ui:theme:${userId}`, next).catch(() => {}); };

  const previewTree: TemplateTree = { weeks: [{ id: `draft:${crypto.randomUUID()}`, name: 'Tuần 1', order: 0 }], items: [] };
  const createTemplate = () => { setTemplateError(null); setTemplateEditor({ key: crypto.randomUUID(), tree: previewTree, name: '', status: 'draft' }); };
  const openTemplate = (position: Position) => {
    if (!catalogs) return;
    setTemplateLoading(true); setTemplateError(null);
    void catalogs.template(position.templateListId).then((tree) => {
      setTemplateEditor({ key: position.id, positionId: position.id, tree, name: position.name, status: position.status });
    }).catch((error: unknown) => setTemplateError(describeError(error).message)).finally(() => setTemplateLoading(false));
  };
  const openCopy = (position: Position) => {
    if (!catalogs) return;
    setCopyLoading(true); setCopyError(null);
    void catalogs.template(position.templateListId).then((tree) => setCopySource({ position, tree }))
      .catch((error: unknown) => setCopyError(describeError(error).message)).finally(() => setCopyLoading(false));
  };
  const copyTemplate = (_source: Position, selection: CopySelection) => {
    if (!copySource) throw new Error('COPY_SELECTION_INVALID');
    setTemplateEditor({ key: crypto.randomUUID(), tree: selectTemplate(copySource.tree, selection), name: '', status: 'draft' });
    setCopySource(null);
  };
  const saveTemplate = async (tree: TemplateTree, name: string, status: 'draft' | 'ready') => {
    if (!binding || !templateEditor) throw new Error('ROOM_NOT_CONFIGURED');
    const positionId = await saveTemplateV4(app, binding, { positionId: templateEditor.positionId, tree, name, status });
    setTemplateEditor((current) => current ? { ...current, positionId, status } : current);
    setCatalogRevision((value) => value + 1);
  };
  const disablePosition = async () => {
    if (!binding || !disableTarget || disableBusy) return;
    setDisableBusy(true); setDisableError(null);
    try {
      const actions = createHrV4Actions(createMcpHrV4Gateway(app, binding), binding.roomId, userRoles ?? []);
      await actions.disablePosition(disableTarget.id);
      setDisableTarget(null);
      setCatalogRevision((value) => value + 1);
    } catch (cause) { setDisableError(describeError(cause).message); }
    finally { setDisableBusy(false); }
  };
  return <OnboardingShell role={role} roomId={roomId} screen={screen} onNavigate={(next) => { setScreen(next); setTemplateEditor(null); setCopySource(null); setImportOpen(false); }} locale={locale} onLocaleChange={changeLocale} theme={theme} onThemeChange={changeTheme}>
    {admin && catalogs && screen === 'hires' && <HiresScreen key={`${identityKey}:${catalogRevision}`} catalogs={catalogs} identityKey={identityKey} locale={locale} onCreate={() => setScreen('provision')} onOpen={setSelectedHireId} />}
    {admin && catalogs && binding && selectedHireId && <HrV4Drawer app={app} binding={binding} catalogs={catalogs} actorRoles={userRoles ?? []} hireId={selectedHireId} onClose={() => setSelectedHireId(null)} onChanged={() => setCatalogRevision((value) => value + 1)} />}
    {admin && catalogs && binding && screen === 'provision' && <ProvisionV4Form app={app} binding={binding} catalogs={catalogs} actorRoles={userRoles ?? []} onDone={() => { setCatalogRevision((value) => value + 1); setScreen('hires'); }} />}
    {admin && screen === 'templates' && templateEditor && <><button type="button" className="v4-secondary-button v4-builder-back" onClick={() => { setTemplateEditor(null); setCatalogRevision((value) => value + 1); }}>Quay lại danh sách</button><TemplateBuilder key={templateEditor.key} mode="live" initial={templateEditor.tree} initialName={templateEditor.name} initialStatus={templateEditor.status} onSave={saveTemplate} positionId={templateEditor.positionId} filesGateway={filesGateway ?? undefined} /></>}
    {admin && screen === 'templates' && templateLoading && <p role="status">Đang tải template</p>}
    {admin && screen === 'templates' && templateError && <p role="alert">{templateError}</p>}
    {admin && screen === 'templates' && !templateEditor && binding && importOpen && <><button type="button" className="v4-secondary-button" onClick={() => setImportOpen(false)}>Quay lại danh sách</button><ImportFolderPanel app={app} binding={binding} roomId={roomId} userRoles={userRoles ?? []} onDone={() => setCatalogRevision((value) => value + 1)} /></>}
    {admin && catalogs && screen === 'templates' && !templateEditor && !templateLoading && !importOpen && <><div className="v4-template-tools"><button type="button" className="v4-secondary-button" onClick={() => setImportOpen(true)}>Nhập thư mục Markdown</button></div><PositionsScreen key={`${identityKey}:${catalogRevision}`} catalogs={catalogs} identityKey={identityKey} locale={locale} onCreate={createTemplate} onOpen={openTemplate} onCopy={openCopy} onDisable={setDisableTarget} /></>}
    {admin && screen === 'templates' && copyLoading && <p role="status">Đang tải template để copy</p>}
    {admin && screen === 'templates' && copyError && <p role="alert">{copyError}</p>}
    {admin && screen === 'templates' && copySource && <CopyTemplateDialog sources={[copySource]} onCopy={copyTemplate} onClose={() => setCopySource(null)} />}
    {admin && disableTarget && <div className="v4-builder-dialog" role="alertdialog" aria-modal="true" aria-label="Xác nhận ngừng dùng vị trí"><h2>Ngừng dùng {disableTarget.name}?</h2><p>Vị trí sẽ không xuất hiện trong form tạo onboarding mới.</p>{disableError && <p role="alert">{disableError}</p>}<button type="button" disabled={disableBusy} onClick={() => setDisableTarget(null)}>Giữ lại</button><button type="button" disabled={disableBusy} onClick={() => void disablePosition()}>{disableBusy ? 'Đang cập nhật' : 'Xác nhận'}</button></div>}
    {admin && !catalogs && !(screen === 'templates' && templateEditor) && <UnconfiguredScreen key={identityKey} screen={screen} locale={locale} message={bootstrapMessage} />}
    {!admin && binding && userId && <EmployeeRoadmapScreen key={identityKey} app={app} binding={binding} userId={userId} filesGateway={filesGateway ?? undefined} />}
    {!admin && (!binding || !userId) && <UnconfiguredScreen key={identityKey} screen="roadmap" locale={locale} message={bootstrapMessage} />}
  </OnboardingShell>;
}
