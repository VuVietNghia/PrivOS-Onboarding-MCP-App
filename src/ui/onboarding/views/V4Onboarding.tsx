import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Catalogs } from '../ports/catalogs';
import type { HireStatus, Position, PositionStatus, TemplateTree } from '../domain/models';
import { selectTemplate, type CopySelection } from '../domain/select-template';
import { countHireStatuses, HiresCatalogTable, PositionsCatalogTable, type HireStatusCounts } from './V4CatalogTables';
import { OnboardingShell, type OnboardingScreen, type OnboardingTheme } from './OnboardingShell';
import { TemplateBuilder } from './templates/TemplateBuilder';
import { CopyTemplateDialog, type CopySource } from './templates/CopyTemplateDialog';
// Markdown folder import is temporarily disabled; uncomment the integration to restore it.
// import { ImportFolderPanel } from './templates/ImportFolderPanel';
import { ProvisionV4Form } from './ProvisionV4Form';
import { HrV4Drawer } from './HrV4Drawer';
import { EmployeeRoadmapScreen } from './learning/EmployeeRoadmapScreen';
import { useCatalogPage } from './use-catalog-page';
import { useOnboardingSession } from '../../composition/PrivosOnboardingRoot';
import type { Scheduler } from '../../../shared/ports/effects';
import { useUiLocale } from '../../i18n/OnboardingI18nProvider';
import { getErrorMessage } from '../../i18n/error-message';
import { toUiError, type UiError } from '../../i18n/ui-error';
import { useDialogFocus } from './use-dialog-focus';
import type { UiLocale } from '../../i18n/locale';

function useDebouncedText(value: string, scheduler: Scheduler): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    return scheduler.after(300, () => setDebounced(value));
  }, [value, scheduler]);
  return debounced;
}

function HiresScreen({ catalogs, identityKey, scheduler, onCreate, onOpen }: { catalogs: Catalogs; identityKey: string; scheduler: Scheduler; onCreate: () => void; onOpen: (hireId: string) => void }) {
  const [search, setSearch] = useState('');
  const query = useDebouncedText(search, scheduler);
  const [status, setStatus] = useState<HireStatus | 'all'>('all');
  const [statusCounts, setStatusCounts] = useState<HireStatusCounts>(() => countHireStatuses([]));
  const [positionQuery, setPositionQuery] = useState('');
  const debouncedPositionQuery = useDebouncedText(positionQuery, scheduler);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [positionLookupOpen, setPositionLookupOpen] = useState(false);
  const [positionOptions, setPositionOptions] = useState<Position[]>([]);
  const [positionLookupLoading, setPositionLookupLoading] = useState(false);
  const [positionLookupError, setPositionLookupError] = useState<UiError | null>(null);
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
      if (active && revision === lookupRevision.current) setPositionLookupError(toUiError(error));
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
  useEffect(() => {
    if (status === 'all' && !page.loading && !page.error) setStatusCounts(countHireStatuses(page.items));
  }, [page.error, page.items, page.loading, status]);
  return <HiresCatalogTable {...page} statusCounts={statusCounts} search={search} onSearch={setSearch} status={status} onStatus={setStatus} onPrevious={page.previous} onNext={page.next} onReload={page.reload} onCreate={onCreate} onOpen={(hire) => onOpen(hire.id)} positionQuery={positionQuery} selectedPosition={selectedPosition} positionOptions={positionOptions} positionLookupOpen={positionLookupOpen} positionLookupLoading={positionLookupLoading} positionLookupError={positionLookupError} onPositionQuery={changePositionQuery} onPositionFocus={() => { if (!selectedPosition && !positionLookupOpen) { lookupRevision.current += 1; setPositionLookupLoading(true); setPositionLookupOpen(true); } }} onPositionSelect={selectPosition} onPositionClear={clearPosition} onPositionClose={() => setPositionLookupOpen(false)} />;
}

function PositionsScreen({ catalogs, identityKey, scheduler, search, onSearch, status, onStatus, onCreate, onOpen, onCopy, onDisable }: { catalogs: Catalogs; identityKey: string; scheduler: Scheduler; search: string; onSearch: (value: string) => void; status: PositionStatus | 'all'; onStatus: (value: PositionStatus | 'all') => void; onCreate: () => void; onOpen: (position: Position) => void; onCopy: (position: Position) => void; onDisable: (position: Position) => void }) {
  const query = useDebouncedText(search, scheduler);
  const load = useCallback((cursor?: string) => catalogs.positions({ text: query, ...(status !== 'all' ? { status } : {}) }, cursor, 'updated-desc'), [catalogs, query, status]);
  const page = useCatalogPage(JSON.stringify([identityKey, 'positions', query, status, 'updated-desc']), load);
  return <PositionsCatalogTable {...page} search={search} onSearch={onSearch} status={status} onStatus={onStatus} onPrevious={page.previous} onNext={page.next} onReload={page.reload} onCreate={onCreate} onOpen={onOpen} onCopy={onCopy} onDisable={onDisable} />;
}

function UnconfiguredScreen({ screen, error }: { screen: OnboardingScreen; error: UiError }) {
  const [hireSearch, setHireSearch] = useState('');
  const [positionSearch, setPositionSearch] = useState('');
  const [hireStatus, setHireStatus] = useState<HireStatus | 'all'>('all');
  const [positionStatus, setPositionStatus] = useState<PositionStatus | 'all'>('all');
  const { t: commonT } = useTranslation('common');
  const { t: adminT } = useTranslation('admin');
  const { t: errorT } = useTranslation('errors');
  if (screen === 'templates') return <PositionsCatalogTable items={[]} loading={false} error={error} search={positionSearch} onSearch={setPositionSearch} status={positionStatus} onStatus={setPositionStatus} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} />;
  if (screen === 'hires') return <HiresCatalogTable items={[]} loading={false} error={error} search={hireSearch} onSearch={setHireSearch} status={hireStatus} onStatus={setHireStatus} canPrevious={false} canNext={false} onPrevious={() => {}} onNext={() => {}} />;
  return <section className="v4-screen"><h1>{screen === 'roadmap' ? commonT('shell.roadmap') : adminT('createOnboarding')}</h1><p role="status">{getErrorMessage(error, errorT)}</p></section>;
}

export function V4Onboarding({ admin, employeePreviewControl, onResolvedThemeChange }: { admin: boolean; employeePreviewControl?: {
  active: boolean; onToggle: () => void }; onResolvedThemeChange?: (theme: OnboardingTheme) => void }) {
  const session = useOnboardingSession();
  if (!session) throw new Error('ONBOARDING_SESSION_MISSING');
  const services = session.services;
  const { roomId, userId /*, roles: userRoles */ } = session.actor;
  const hostTheme = session.hostTheme;
  const role = admin ? 'admin' : 'employee';
  const [screen, setScreen] = useState<OnboardingScreen>(admin ? 'hires' : 'roadmap');
  const [templateEditor, setTemplateEditor] = useState<{ key: string; positionId?: string; tree: TemplateTree; name: string; status: 'draft' | 'ready' | 'disabled' } | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<UiError | null>(null);
  const [copySource, setCopySource] = useState<CopySource | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState<UiError | null>(null);
  // const [importOpen, setImportOpen] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [positionSearch, setPositionSearch] = useState('');
  const [positionStatus, setPositionStatus] = useState<PositionStatus | 'all'>('all');
  const [selectedHireId, setSelectedHireId] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<Position | null>(null);
  const disableDialogRef = useRef<HTMLDivElement>(null);
  const disableKeepRef = useRef<HTMLButtonElement>(null);
  const closeDisableDialog = useCallback(() => setDisableTarget(null), []);
  useDialogFocus({ open: disableTarget !== null, onClose: closeDisableDialog, containerRef: disableDialogRef, initialFocusRef: disableKeepRef });
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<UiError | null>(null);
  const { locale, setLocale } = useUiLocale();
  const { t: adminT } = useTranslation('admin');
  const { t: templatesT } = useTranslation('templates');
  const { t: errorT } = useTranslation('errors');
  const [theme, setTheme] = useState<OnboardingTheme>(hostTheme === 'dark' ? 'dark' : 'light');
  const identityKey = session.key;
  useEffect(() => { onResolvedThemeChange?.(theme); }, [theme, onResolvedThemeChange]);

  useEffect(() => { setScreen(admin ? 'hires' : 'roadmap'); setTemplateEditor(null); setSelectedHireId(null); setCopySource(null); setPositionSearch(''); setPositionStatus('all'); /* setImportOpen(false); */ }, [admin, roomId, userId]);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setTheme(hostTheme === 'dark' ? 'dark' : 'light');
    if (!services) return;
    void services.preferences.get(`ui:theme:${userId}`).then((savedTheme) => {
      if (!active) return;
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'brand') setTheme(savedTheme);
    }).catch(() => {});
    return () => { active = false; };
  }, [userId, hostTheme, services]);
  const bindingState = { result: session.bootstrap, error: session.error ? toUiError(session.error) : null };
  const binding = bindingState.result?.state === 'ready' ? bindingState.result.binding : null;
  const catalogs = admin ? services?.catalogs ?? null : null;
  const filesGateway = services?.files ?? null;
  const bootstrapError: UiError = bindingState.error
    ?? (bindingState.result?.state === 'needs-admin' ? { code: 'BOOTSTRAP_NEEDS_ADMIN' }
      : bindingState.result?.state === 'blocked' ? { code: bindingState.result.code }
      : { code: 'BOOTSTRAP_UNAVAILABLE' });
  const changeLocale = (next: UiLocale) => setLocale(next);
  const changeTheme = (next: OnboardingTheme) => { setTheme(next); if (userId && services) void services.preferences.set(`ui:theme:${userId}`, next).catch(() => {}); };

  const createTemplate = () => { if (!services) throw new Error('ROOM_NOT_CONFIGURED'); setTemplateError(null); setTemplateEditor({
    key: services.ids.next(),
    tree: { weeks: [{ id: `draft:${services.ids.next()}`, name: templatesT('defaults.week', { count: 1 }), order: 0 }], items: [] },
    name: '', status: 'draft',
  }); };
  const openTemplate = (position: Position) => {
    if (!catalogs) return;
    setTemplateLoading(true); setTemplateError(null);
    void catalogs.template(position.templateListId).then((tree) => {
      setTemplateEditor({ key: position.id, positionId: position.id, tree, name: position.name, status: position.status });
    }).catch((error: unknown) => setTemplateError(toUiError(error))).finally(() => setTemplateLoading(false));
  };
  const openCopy = (position: Position) => {
    if (!catalogs) return;
    setCopyLoading(true); setCopyError(null);
    void catalogs.template(position.templateListId).then((tree) => setCopySource({ position, tree }))
      .catch((error: unknown) => setCopyError(toUiError(error))).finally(() => setCopyLoading(false));
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
    } catch (cause) { setDisableError(toUiError(cause)); }
    finally { setDisableBusy(false); }
  };
  return <OnboardingShell role={role} roomId={roomId} screen={screen} onNavigate={(next) => { setScreen(next); setTemplateEditor(null); setCopySource(null); /* setImportOpen(false); */ }} locale={locale} onLocaleChange={changeLocale} theme={theme} onThemeChange={changeTheme} employeePreviewControl={employeePreviewControl}>
    {admin && catalogs && services && screen === 'hires' && <HiresScreen key={`${identityKey}:${catalogRevision}`} catalogs={catalogs} identityKey={identityKey} scheduler={services.scheduler} onCreate={() => setScreen('provision')} onOpen={setSelectedHireId} />}
    {admin && catalogs && services && selectedHireId && <HrV4Drawer catalogs={catalogs} services={services} hireId={selectedHireId} onClose={() => setSelectedHireId(null)} onChanged={() => setCatalogRevision((value) => value + 1)} />}
    {admin && catalogs && binding && services && screen === 'provision' && <ProvisionV4Form key={identityKey} binding={binding} catalogs={catalogs} services={services} onDone={() => { setCatalogRevision((value) => value + 1); setScreen('hires'); }} />}
    {admin && services && screen === 'templates' && templateEditor && <><button type="button" className="v4-secondary-button v4-builder-back" onClick={() => { setTemplateEditor(null); setCatalogRevision((value) => value + 1); }}>{templatesT('shell.back')}</button><TemplateBuilder key={templateEditor.key} mode="live" initial={templateEditor.tree} initialName={templateEditor.name} initialStatus={templateEditor.status} onSave={saveTemplate} positionId={templateEditor.positionId} filesGateway={filesGateway ?? undefined} ids={services.ids} focus={services.focus} /></>}
    {admin && screen === 'templates' && templateLoading && <p role="status">{templatesT('shell.loadingTemplate')}</p>}
    {admin && screen === 'templates' && templateError && <p role="alert">{getErrorMessage(templateError, errorT)}</p>}
    {/* {admin && screen === 'templates' && !templateEditor && binding && services && importOpen && <><button type="button" className="v4-secondary-button" onClick={() => setImportOpen(false)}>{templatesT('shell.back')}</button><ImportFolderPanel binding={binding} roomId={roomId} userRoles={userRoles} services={services} onDone={() => setCatalogRevision((value) => value + 1)} /></>} */}
    {admin && catalogs && services && screen === 'templates' && !templateEditor && !templateLoading /* && !importOpen */ && <>
      {/* <div className="v4-template-tools"><button type="button" className="v4-secondary-button" onClick={() => setImportOpen(true)}>{templatesT('shell.importFolder')}</button></div> */}
      <PositionsScreen key={`${identityKey}:${catalogRevision}`} catalogs={catalogs} identityKey={identityKey} scheduler={services.scheduler} search={positionSearch} onSearch={setPositionSearch} status={positionStatus} onStatus={setPositionStatus} onCreate={createTemplate} onOpen={openTemplate} onCopy={openCopy} onDisable={setDisableTarget} />
    </>}
    {admin && screen === 'templates' && copyLoading && <p role="status">{templatesT('shell.loadingCopy')}</p>}
    {admin && screen === 'templates' && copyError && <p role="alert">{getErrorMessage(copyError, errorT)}</p>}
    {admin && screen === 'templates' && copySource && <CopyTemplateDialog sources={[copySource]} onCopy={copyTemplate} onClose={() => setCopySource(null)} />}
    {admin && disableTarget && <div ref={disableDialogRef} className="v4-builder-dialog" role="alertdialog" aria-modal="true" aria-label={adminT('disableDialog.label')}><h2>{adminT('disableDialog.title', { name: disableTarget.name })}</h2><p>{adminT('disableDialog.body')}</p>{disableError && <p role="alert">{getErrorMessage(disableError, errorT)}</p>}<button ref={disableKeepRef} type="button" disabled={disableBusy} onClick={closeDisableDialog}>{adminT('disableDialog.keep')}</button><button type="button" disabled={disableBusy} onClick={() => void disablePosition()}>{disableBusy ? adminT('disableDialog.updating') : adminT('disableDialog.confirm')}</button></div>}
    {admin && !catalogs && !(screen === 'templates' && templateEditor) && <UnconfiguredScreen key={identityKey} screen={screen} error={bootstrapError} />}
    {!admin && binding && userId && services && <EmployeeRoadmapScreen key={identityKey} services={services} filesGateway={filesGateway ?? undefined} />}
    {!admin && (!binding || !userId) && <UnconfiguredScreen key={identityKey} screen="roadmap" error={bootstrapError} />}
  </OnboardingShell>;
}
