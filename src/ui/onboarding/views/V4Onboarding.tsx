import { useCallback, useEffect, useRef, useState } from 'react';
import type { Catalogs } from '../ports/catalogs';
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
import { useOnboardingSession } from '../../composition/PrivosOnboardingRoot';
import type { Scheduler } from '../../../shared/ports/effects';

function useDebouncedText(value: string, scheduler: Scheduler): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    return scheduler.after(300, () => setDebounced(value));
  }, [value, scheduler]);
  return debounced;
}

function HiresScreen({ catalogs, identityKey, locale, scheduler, onCreate, onOpen }: { catalogs: Catalogs; identityKey: string; locale: OnboardingLocale; scheduler: Scheduler; onCreate: () => void; onOpen: (hireId: string) => void }) {
  const [search, setSearch] = useState('');
  const query = useDebouncedText(search, scheduler);
  const [status, setStatus] = useState<HireStatus | 'all'>('all');
  const [positionQuery, setPositionQuery] = useState('');
  const debouncedPositionQuery = useDebouncedText(positionQuery, scheduler);
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

function PositionsScreen({ catalogs, identityKey, locale, scheduler, onCreate, onOpen, onCopy, onDisable }: { catalogs: Catalogs; identityKey: string; locale: OnboardingLocale; scheduler: Scheduler; onCreate: () => void; onOpen: (position: Position) => void; onCopy: (position: Position) => void; onDisable: (position: Position) => void }) {
  const [search, setSearch] = useState('');
  const query = useDebouncedText(search, scheduler);
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

export function V4Onboarding({ admin, employeePreviewControl }: { admin: boolean; employeePreviewControl?: {
  active: boolean; onToggle: () => void; labels: Record<OnboardingLocale, { inactive: string; active: string }> } }) {
  const session = useOnboardingSession();
  if (!session) throw new Error('ONBOARDING_SESSION_MISSING');
  const services = session.services;
  const { roomId, userId, roles: userRoles } = session.actor;
  const hostTheme = session.hostTheme;
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
  const [locale, setLocale] = useState<OnboardingLocale>(session.hostLocale ?? 'vi');
  const [theme, setTheme] = useState<OnboardingTheme>(hostTheme === 'dark' ? 'dark' : 'light');
  const identityKey = session.key;

  useEffect(() => { setScreen(admin ? 'hires' : 'roadmap'); setTemplateEditor(null); setSelectedHireId(null); setCopySource(null); setImportOpen(false); }, [admin, roomId, userId]);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLocale(session.hostLocale ?? 'vi');
    setTheme(hostTheme === 'dark' ? 'dark' : 'light');
    if (!services) return;
    void Promise.all([services.preferences.get(`ui:language:${userId}`), services.preferences.get(`ui:theme:${userId}`)]).then(([savedLocale, savedTheme]) => {
      if (!active) return;
      if (savedLocale === 'vi' || savedLocale === 'en') setLocale(savedLocale);
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'brand') setTheme(savedTheme);
    }).catch(() => {});
    return () => { active = false; };
  }, [userId, hostTheme, services, session.hostLocale]);
  const bindingState = { result: session.bootstrap, error: session.error ? describeError(session.error).message : null };
  const binding = bindingState.result?.state === 'ready' ? bindingState.result.binding : null;
  const catalogs = admin ? services?.catalogs ?? null : null;
  const filesGateway = services?.files ?? null;
  const t = v4CatalogCopy(locale);
  const bootstrapMessage = bindingState.error ? translateV4Error(bindingState.error, locale)
    : bindingState.result?.state === 'needs-admin' ? t.needsAdmin
    : bindingState.result?.state === 'blocked' ? t[bindingState.result.code]
    : bindingState.result ? t.unavailable : t.loading;
  const changeLocale = (next: OnboardingLocale) => { setLocale(next); if (userId && services) void services.preferences.set(`ui:language:${userId}`, next).catch(() => {}); };
  const changeTheme = (next: OnboardingTheme) => { setTheme(next); if (userId && services) void services.preferences.set(`ui:theme:${userId}`, next).catch(() => {}); };

  const createTemplate = () => { if (!services) throw new Error('ROOM_NOT_CONFIGURED'); setTemplateError(null); setTemplateEditor({
    key: services.ids.next(),
    tree: { weeks: [{ id: `draft:${services.ids.next()}`, name: 'Tuần 1', order: 0 }], items: [] },
    name: '', status: 'draft',
  }); };
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
    if (!copySource || !services) throw new Error('COPY_SELECTION_INVALID');
    setTemplateEditor({ key: services.ids.next(), tree: selectTemplate(copySource.tree, selection, services.ids), name: '', status: 'draft' });
    setCopySource(null);
  };
  const saveTemplate = async (tree: TemplateTree, name: string, status: 'draft' | 'ready', positionIdOverride?: string): Promise<string> => {
    if (!binding || !templateEditor || !services) throw new Error('ROOM_NOT_CONFIGURED');
    const editorKey = templateEditor.key;
    const existingPositionId = positionIdOverride ?? templateEditor.positionId;
    const positionId = await services.templates.save({ positionId: existingPositionId, tree, name, status,
      ...(!existingPositionId ? { templateKey: `onb-tpl-${editorKey}` } : {}) });
    setTemplateEditor((current) => current?.key === editorKey ? { ...current, positionId, status } : current);
    setCatalogRevision((value) => value + 1);
    return positionId;
  };
  const disablePosition = async () => {
    if (!binding || !services || !disableTarget || disableBusy) return;
    setDisableBusy(true); setDisableError(null);
    try {
      await services.hr.disablePosition(disableTarget.id);
      setDisableTarget(null);
      setCatalogRevision((value) => value + 1);
    } catch (cause) { setDisableError(describeError(cause).message); }
    finally { setDisableBusy(false); }
  };
  return <OnboardingShell role={role} roomId={roomId} screen={screen} onNavigate={(next) => { setScreen(next); setTemplateEditor(null); setCopySource(null); setImportOpen(false); }} locale={locale} onLocaleChange={changeLocale} theme={theme} onThemeChange={changeTheme} employeePreviewControl={employeePreviewControl}>
    {admin && catalogs && services && screen === 'hires' && <HiresScreen key={`${identityKey}:${catalogRevision}`} catalogs={catalogs} identityKey={identityKey} locale={locale} scheduler={services.scheduler} onCreate={() => setScreen('provision')} onOpen={setSelectedHireId} />}
    {admin && catalogs && services && selectedHireId && <HrV4Drawer catalogs={catalogs} services={services} hireId={selectedHireId} onClose={() => setSelectedHireId(null)} onChanged={() => setCatalogRevision((value) => value + 1)} />}
    {admin && catalogs && binding && services && screen === 'provision' && <ProvisionV4Form key={identityKey} binding={binding} catalogs={catalogs} services={services} onDone={() => { setCatalogRevision((value) => value + 1); setScreen('hires'); }} />}
    {admin && services && screen === 'templates' && templateEditor && <><button type="button" className="v4-secondary-button v4-builder-back" onClick={() => { setTemplateEditor(null); setCatalogRevision((value) => value + 1); }}>Quay lại danh sách</button><TemplateBuilder key={templateEditor.key} mode="live" initial={templateEditor.tree} initialName={templateEditor.name} initialStatus={templateEditor.status} onSave={saveTemplate} positionId={templateEditor.positionId} filesGateway={filesGateway ?? undefined} ids={services.ids} focus={services.focus} /></>}
    {admin && screen === 'templates' && templateLoading && <p role="status">Đang tải template</p>}
    {admin && screen === 'templates' && templateError && <p role="alert">{templateError}</p>}
    {admin && screen === 'templates' && !templateEditor && binding && services && importOpen && <><button type="button" className="v4-secondary-button" onClick={() => setImportOpen(false)}>Quay lại danh sách</button><ImportFolderPanel binding={binding} roomId={roomId} userRoles={userRoles} services={services} onDone={() => setCatalogRevision((value) => value + 1)} /></>}
    {admin && catalogs && services && screen === 'templates' && !templateEditor && !templateLoading && !importOpen && <><div className="v4-template-tools"><button type="button" className="v4-secondary-button" onClick={() => setImportOpen(true)}>Nhập thư mục Markdown</button></div><PositionsScreen key={`${identityKey}:${catalogRevision}`} catalogs={catalogs} identityKey={identityKey} locale={locale} scheduler={services.scheduler} onCreate={createTemplate} onOpen={openTemplate} onCopy={openCopy} onDisable={setDisableTarget} /></>}
    {admin && screen === 'templates' && copyLoading && <p role="status">Đang tải template để copy</p>}
    {admin && screen === 'templates' && copyError && <p role="alert">{copyError}</p>}
    {admin && screen === 'templates' && copySource && <CopyTemplateDialog sources={[copySource]} onCopy={copyTemplate} onClose={() => setCopySource(null)} />}
    {admin && disableTarget && <div className="v4-builder-dialog" role="alertdialog" aria-modal="true" aria-label="Xác nhận ngừng dùng vị trí"><h2>Ngừng dùng {disableTarget.name}?</h2><p>Vị trí sẽ không xuất hiện trong form tạo onboarding mới.</p>{disableError && <p role="alert">{disableError}</p>}<button type="button" disabled={disableBusy} onClick={() => setDisableTarget(null)}>Giữ lại</button><button type="button" disabled={disableBusy} onClick={() => void disablePosition()}>{disableBusy ? 'Đang cập nhật' : 'Xác nhận'}</button></div>}
    {admin && !catalogs && !(screen === 'templates' && templateEditor) && <UnconfiguredScreen key={identityKey} screen={screen} locale={locale} message={bootstrapMessage} />}
    {!admin && binding && userId && services && <EmployeeRoadmapScreen key={identityKey} services={services} filesGateway={filesGateway ?? undefined} locale={locale} />}
    {!admin && (!binding || !userId) && <UnconfiguredScreen key={identityKey} screen="roadmap" locale={locale} message={bootstrapMessage} />}
  </OnboardingShell>;
}
