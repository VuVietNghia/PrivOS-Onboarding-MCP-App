import type { Hire, HireStatus, Position, PositionStatus } from '../domain/models';
import { useTranslation } from 'react-i18next';
import { formatDateOnly, formatPercent } from '../../i18n/formatters';
import type { UiError } from '../../i18n/ui-error';
import { getErrorMessage } from '../../i18n/error-message';
import { StatusBadge } from '../components/StatusBadge';
import { UiState } from '../components/UiState';
import { useEffect, useState } from 'react';
import { parseLocale } from '../../i18n/locale';

interface BaseProps<T, S extends string> {
  items: T[];
  loading: boolean;
  error: UiError | null;
  search: string;
  onSearch: (value: string) => void;
  status: S | 'all';
  onStatus: (value: S | 'all') => void;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onReload?: () => void;
  onReset?: () => void;
}

export interface HiresCatalogTableProps extends BaseProps<Hire, HireStatus> {
  onCreate?: () => void;
  onOpen?: (hire: Hire) => void;
  positionQuery?: string;
  selectedPosition?: Position | null;
  positionOptions?: Position[];
  positionLookupOpen?: boolean;
  positionLookupLoading?: boolean;
  positionLookupError?: UiError | null;
  onPositionQuery?: (value: string) => void;
  onPositionFocus?: () => void;
  onPositionSelect?: (position: Position) => void;
  onPositionClear?: () => void;
  onPositionClose?: () => void;
  positionHasMore?: boolean;
  onPositionMore?: () => void;
  onPositionRetry?: () => void;
}
export interface PositionsCatalogTableProps extends BaseProps<Position, PositionStatus> {
  onCreate?: () => void;
  onOpen?: (position: Position) => void;
  onCopy?: (position: Position) => void;
  onDisable?: (position: Position) => void;
}

function useCatalogCopy() {
  const { t: translate, i18n } = useTranslation('admin');
  const locale = parseLocale(i18n.resolvedLanguage ?? i18n.language) ?? 'vi';
  return { locale, t: {
    onPage: translate('onPage'), profiles: translate('profiles'), positions: translate('positions'), manageOnboarding: translate('manageOnboarding'), hiresSubtitle: translate('hiresSubtitle'), createOnboarding: translate('createOnboarding'),
    searchHires: translate('searchHires'), searchHiresPlaceholder: translate('searchHiresPlaceholder'),
    updating: translate('updatingResults'), filteredEmpty: translate('filteredEmpty'), latestUpdated: translate('latestUpdated'), loadMorePositions: translate('loadMorePositions'), appliedPosition: (name: string) => translate('appliedPosition', { name }),
    filterStatus: translate('filterStatus'), filterPosition: translate('filterPosition'), allStatuses: translate('allStatuses'), allPositions: translate('allPositions'), clearPosition: translate('clearPosition'), noMatchingPositions: translate('noMatchingPositions'), reset: translate('reset'),
    showingProfiles: (count: number) => translate('showingProfiles', { count }), showingPositions: (count: number) => translate('showingPositions', { count }), employee: translate('employee'), position: translate('position'), start: translate('startDate'), progress: translate('progress'), quizScores: translate('quizScores'), noQuizScores: translate('noQuizScores'),
    actions: translate('actions'), viewRoadmap: translate('viewRoadmap'), status: translate('status'), days: translate('days'), previous: translate('previous'), next: translate('next'), reload: translate('reload'), loading: translate('loading'), noHires: translate('noHires'),
    templateEyebrow: translate('templateEyebrow'), templateTitle: translate('templateTitle'), templateSubtitle: translate('templateSubtitle'), createTemplate: translate('createTemplate'), searchPosition: translate('searchPosition'), filterTemplateStatus: translate('filterTemplateStatus'),
    stageWeeks: translate('weeks'), dayItems: translate('dayItems'), lessons: translate('lessons'), questions: translate('questions'), missingAnswers: translate('missingAnswers'), inUse: translate('inUse'), openTemplate: translate('open'), copy: translate('copy'), disable: translate('disable'), noPositions: translate('noPositions'),
    hireProvisioning: translate('hireStatus.provisioning'), hireLearning: translate('hireStatus.learning'), hireDone: translate('hireStatus.done'), hireFailed: translate('hireStatus.failed'), hireCancelled: translate('hireStatus.cancelled'),
    positionDraft: translate('positionStatus.draft'), positionReady: translate('positionStatus.ready'), positionDisabled: translate('positionStatus.disabled'),
  } };
}

function Pager({ canPrevious, canNext, onPrevious, onNext }: Pick<HiresCatalogTableProps, 'canPrevious' | 'canNext' | 'onPrevious' | 'onNext'>) {
  const { t } = useCatalogCopy();
  return <div className="v4-pager"><button type="button" disabled={!canPrevious} onClick={onPrevious}>{t.previous}</button><button type="button" disabled={!canNext} onClick={onNext}>{t.next}</button></div>;
}

function ErrorOrEmpty({ error, loading, empty, onReload, onClear }: { error: UiError | null; loading: boolean; empty: string; onReload?: () => void; onClear?: () => void }) {
  const { t } = useCatalogCopy();
  const { t: errorT } = useTranslation('errors');
  if (loading) return <UiState kind="loading">{t.loading}</UiState>;
  if (error) return <UiState kind="error" onRetry={onReload}>{getErrorMessage(error, errorT)}</UiState>;
  return <UiState kind="empty">{onClear ? t.filteredEmpty : empty}{onClear && <button type="button" className="v4-secondary-button" onClick={onClear}>{t.reset}</button>}</UiState>;
}

function StatusSelect<S extends string>({ label, status, choices, onStatus }: { label: string; status: S; choices: readonly { value: S; label: string }[]; onStatus: (value: S) => void }) {
  return <label className="v4-filter"><span>{label}</span><select value={status} onChange={(event) => {
    const choice = choices.find((candidate) => candidate.value === event.currentTarget.value);
    if (choice) onStatus(choice.value);
  }}>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>;
}

export function HiresCatalogTable(props: HiresCatalogTableProps) {
  const { items, loading, error, search, onSearch, status, onStatus, canPrevious, canNext, onPrevious, onNext, onReload, onCreate, onOpen, positionQuery = '', selectedPosition = null, positionOptions = [], positionLookupOpen = false, positionLookupLoading = false, positionLookupError = null, onPositionQuery, onPositionFocus, onPositionSelect, onPositionClear, onPositionClose, positionHasMore = false, onPositionMore, onPositionRetry } = props;
  const { t, locale } = useCatalogCopy();
  const { t: errorT } = useTranslation('errors');
  const [activePositionIndex, setActivePositionIndex] = useState(-1);
  useEffect(() => {
    if (!positionLookupOpen) setActivePositionIndex(-1);
    else setActivePositionIndex((current) => Math.min(current, positionOptions.length));
  }, [positionLookupOpen, positionOptions]);
  const hireStatus: Record<HireStatus, string> = { provisioning: t.hireProvisioning, learning: t.hireLearning, done: t.hireDone, failed: t.hireFailed, cancelled: t.hireCancelled };
  const filtered = Boolean(search.trim() || status !== 'all' || selectedPosition);
  const reset = () => { if (props.onReset) props.onReset(); else { onSearch(''); onStatus('all'); onPositionClear?.(); } };
  return <section className="v4-screen" aria-labelledby="v4-hires-title">
    <div className="v4-page-head"><div><p className="v4-eyebrow">{t.employee}</p><h1 id="v4-hires-title">{t.manageOnboarding}</h1><p>{t.hiresSubtitle}</p></div><button type="button" className="v4-primary-button" disabled={!onCreate} onClick={onCreate}>{t.createOnboarding}</button></div>
    <div className="v4-toolbar v4-hires-toolbar"><label className="v4-search"><span>{t.searchHires}</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.searchHiresPlaceholder} /></label>
      <div className="v4-position-typeahead" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onPositionClose?.(); }}>
        <label htmlFor="v4-position-filter">{t.filterPosition}</label>
        <input id="v4-position-filter" role="combobox" aria-label={t.filterPosition} aria-autocomplete="list" aria-expanded={positionLookupOpen} aria-controls="v4-position-options" aria-activedescendant={activePositionIndex >= 0 ? `v4-position-option-${activePositionIndex}` : undefined} value={positionQuery} placeholder={t.allPositions} onChange={(event) => { setActivePositionIndex(-1); onPositionQuery?.(event.target.value); }} onFocus={onPositionFocus} onClick={onPositionFocus} onKeyDown={(event) => {
          if (event.key === 'Escape') { setActivePositionIndex(-1); onPositionClose?.(); return; }
          if (event.key === 'ArrowDown') {
            event.preventDefault(); if (!positionLookupOpen) onPositionFocus?.();
            setActivePositionIndex((current) => (current + 1) % (positionOptions.length + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault(); if (!positionLookupOpen) onPositionFocus?.();
            setActivePositionIndex((current) => current <= 0 ? positionOptions.length : current - 1);
          } else if (event.key === 'Enter' && positionLookupOpen && activePositionIndex >= 0) {
            event.preventDefault();
            const position = positionOptions[activePositionIndex - 1];
            if (activePositionIndex === 0) onPositionClear?.();
            else if (position) onPositionSelect?.(position);
            setActivePositionIndex(-1);
          }
        }} />
        {selectedPosition && <button type="button" className="v4-position-clear" aria-label={t.clearPosition} onClick={onPositionClear}>×</button>}
        {positionLookupOpen && <div className="v4-position-options">
          {selectedPosition && <p>{t.appliedPosition(selectedPosition.name)}</p>}
          <div id="v4-position-options" role="listbox" aria-label={t.filterPosition}>
          <button id="v4-position-option-0" type="button" role="option" tabIndex={-1} aria-selected={!selectedPosition} data-active={activePositionIndex === 0} onMouseEnter={() => setActivePositionIndex(0)} onClick={onPositionClear}>{t.allPositions}</button>
          {positionOptions.map((position, index) => <button id={`v4-position-option-${index + 1}`} type="button" role="option" tabIndex={-1} aria-selected={selectedPosition?.id === position.id} data-active={activePositionIndex === index + 1} key={position.id} onMouseEnter={() => setActivePositionIndex(index + 1)} onClick={() => { onPositionSelect?.(position); setActivePositionIndex(-1); }}>{position.name}</button>)}
          </div>
          {positionLookupLoading && <p role="status">{t.loading}</p>}
          {!positionLookupLoading && positionLookupError && <><p role="alert">{getErrorMessage(positionLookupError, errorT)}</p><button type="button" onClick={onPositionRetry}>{t.reload}</button></>}
          {!positionLookupLoading && !positionLookupError && !positionOptions.length && <p>{t.noMatchingPositions}</p>}
          {positionHasMore && !positionLookupError && <button type="button" disabled={positionLookupLoading} onClick={onPositionMore}>{t.loadMorePositions}</button>}
        </div>}
      </div>
      <StatusSelect<HireStatus | 'all'> label={t.filterStatus} status={status} onStatus={onStatus} choices={[{ value: 'all', label: t.allStatuses }, ...(['learning', 'done', 'provisioning', 'failed', 'cancelled'] as const).map((value) => ({ value, label: hireStatus[value] }))]} />
      {filtered && <button type="button" className="v4-secondary-button v4-clear-filters" onClick={reset}>{t.reset}</button>}
    </div>
    <p className="v4-list-meta" aria-live="polite">{loading ? t.updating : error ? null : t.showingProfiles(items.length)}</p>
    <div className="v4-table-wrap" role="region" aria-label={t.employee} tabIndex={0} aria-busy={loading}><table aria-label={t.employee}><thead><tr><th>{t.employee}</th><th>{t.position}</th><th>{t.start}</th><th>{t.progress}</th><th>{t.quizScores}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead><tbody>{items.map((hire) => <tr key={hire.id}><td><strong>{hire.name || hire.employeeId}</strong></td><td>{hire.positionName}</td><td>{formatDateOnly(hire.startDate, locale)}</td><td><div className="v4-progress-copy"><strong>{hire.doneDays}/{hire.totalDays} {t.days}</strong><span>{formatPercent(hire.totalDays ? hire.doneDays / hire.totalDays : 0, locale)}</span></div><div className="v4-mini-progress"><span style={{ width: `${hire.totalDays ? Math.min(100, Math.round(hire.doneDays / hire.totalDays * 100)) : 0}%` }} /></div></td><td>{Object.values(hire.scores).length ? <div className="v4-score-strip">{Object.values(hire.scores).slice(0, 3).map((score, index) => <span className="v4-score" key={index}>{score.first}</span>)}</div> : <span className="v4-muted">{t.noQuizScores}</span>}</td><td><StatusBadge status={hire.status} /></td><td><button type="button" className="v4-row-button" disabled={!onOpen} onClick={() => onOpen?.(hire)}>{t.viewRoadmap}</button></td></tr>)}</tbody></table>{!items.length && <ErrorOrEmpty loading={loading} error={error} empty={t.noHires} onReload={onReload} onClear={filtered ? reset : undefined} />}</div>
    <Pager canPrevious={canPrevious} canNext={canNext} onPrevious={onPrevious} onNext={onNext} />
  </section>;
}

export function PositionsCatalogTable(props: PositionsCatalogTableProps) {
  const { items, loading, error, search, onSearch, status, onStatus, canPrevious, canNext, onPrevious, onNext, onReload, onCreate, onOpen, onCopy, onDisable } = props;
  const { t } = useCatalogCopy();
  const positionStatus: Record<PositionStatus, string> = { draft: t.positionDraft, ready: t.positionReady, disabled: t.positionDisabled };
  const filtered = Boolean(search.trim() || status !== 'all');
  const reset = () => { onSearch(''); onStatus('all'); };
  return <section className="v4-screen" aria-labelledby="v4-positions-title">
    <div className="v4-page-head"><div><p className="v4-eyebrow">{t.templateEyebrow}</p><h1 id="v4-positions-title">{t.templateTitle}</h1><p>{t.templateSubtitle}</p></div><button type="button" className="v4-primary-button" disabled={!onCreate} onClick={onCreate}>{t.createTemplate}</button></div>
    <div className="v4-toolbar"><label className="v4-search"><span>{t.searchPosition}</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.searchPosition} /></label>
      <StatusSelect<PositionStatus | 'all'> label={t.filterTemplateStatus} status={status} onStatus={onStatus} choices={[{ value: 'all', label: t.allStatuses }, ...(['draft', 'ready', 'disabled'] as const).map((value) => ({ value, label: positionStatus[value] }))]} />
      {filtered && <button type="button" className="v4-secondary-button v4-clear-filters" onClick={reset}>{t.reset}</button>}
    </div>
    <p className="v4-list-meta" aria-live="polite">{loading ? t.updating : error ? null : `${t.showingPositions(items.length)} · ${t.latestUpdated}`}</p>
    <div className="v4-table-wrap" role="region" aria-label={t.templateTitle} tabIndex={0} aria-busy={loading}><table aria-label={t.templateTitle}><thead><tr><th>{t.position}</th><th>{t.stageWeeks}</th><th>{t.dayItems}</th><th>{t.lessons}</th><th>{t.questions}</th><th>{t.missingAnswers}</th><th>{t.inUse}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead><tbody>{items.map((position) => <tr key={position.id}><td><strong>{position.name}</strong></td><td>{position.weeks}</td><td>{position.days}</td><td>{position.lessons}</td><td>{position.questions}</td><td>{position.missingAnswers}</td><td>{position.inUse}</td><td><StatusBadge status={position.status} /></td><td><button type="button" className="v4-row-button" disabled={!onOpen} onClick={() => onOpen?.(position)}>{t.openTemplate}</button><button type="button" className="v4-row-button" disabled={!onCopy} onClick={() => onCopy?.(position)}>{t.copy}</button>{position.status !== 'disabled' && <button type="button" className="v4-row-button" disabled={!onDisable} onClick={() => onDisable?.(position)}>{t.disable}</button>}</td></tr>)}</tbody></table>{!items.length && <ErrorOrEmpty loading={loading} error={error} empty={t.noPositions} onReload={onReload} onClear={filtered ? reset : undefined} />}</div>
    <Pager canPrevious={canPrevious} canNext={canNext} onPrevious={onPrevious} onNext={onNext} />
  </section>;
}
