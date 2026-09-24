import type { Hire, HireStatus, Position, PositionStatus } from '../domain/models';
import type { OnboardingLocale } from './OnboardingShell';
import { translateV4Error, v4CatalogCopy } from './v4-catalog-copy';

interface BaseProps<T, S extends string> {
  locale?: OnboardingLocale;
  items: T[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
  status: S | 'all';
  onStatus: (value: S | 'all') => void;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onReload?: () => void;
}

export interface HiresCatalogTableProps extends BaseProps<Hire, HireStatus> {
  onCreate?: () => void;
  onOpen?: (hire: Hire) => void;
  positionQuery?: string;
  selectedPosition?: Position | null;
  positionOptions?: Position[];
  positionLookupOpen?: boolean;
  positionLookupLoading?: boolean;
  positionLookupError?: string | null;
  onPositionQuery?: (value: string) => void;
  onPositionFocus?: () => void;
  onPositionSelect?: (position: Position) => void;
  onPositionClear?: () => void;
  onPositionClose?: () => void;
}
export interface PositionsCatalogTableProps extends BaseProps<Position, PositionStatus> {
  onCreate?: () => void;
  onOpen?: (position: Position) => void;
  onCopy?: (position: Position) => void;
  onDisable?: (position: Position) => void;
}

function Pager({ canPrevious, canNext, onPrevious, onNext, locale = 'vi' }: Pick<HiresCatalogTableProps, 'canPrevious' | 'canNext' | 'onPrevious' | 'onNext' | 'locale'>) {
  const t = v4CatalogCopy(locale);
  return <div className="v4-pager"><button type="button" disabled={!canPrevious} onClick={onPrevious}>{t.previous}</button><button type="button" disabled={!canNext} onClick={onNext}>{t.next}</button></div>;
}

function ErrorOrEmpty({ error, loading, empty, locale = 'vi', onReload }: { error: string | null; loading: boolean; empty: string; locale?: OnboardingLocale; onReload?: () => void }) {
  if (loading) return <p className="v4-table-state" role="status">{v4CatalogCopy(locale).loading}</p>;
  if (error) return <div className="v4-table-state v4-table-error" role="alert"><p>{translateV4Error(error, locale)}</p>{onReload && <button type="button" className="v4-secondary-button" onClick={onReload}>{v4CatalogCopy(locale).reload}</button>}</div>;
  return <p className="v4-table-state">{empty}</p>;
}

export function HiresCatalogTable(props: HiresCatalogTableProps) {
  const { items, loading, error, search, onSearch, status, onStatus, canPrevious, canNext, onPrevious, onNext, onReload, onCreate, onOpen, locale = 'vi', positionQuery = '', selectedPosition = null, positionOptions = [], positionLookupOpen = false, positionLookupLoading = false, positionLookupError = null, onPositionQuery, onPositionFocus, onPositionSelect, onPositionClear, onPositionClose } = props;
  const t = v4CatalogCopy(locale);
  const hireStatus: Record<HireStatus, string> = { provisioning: t.hireProvisioning, learning: t.hireLearning, done: t.hireDone, failed: t.hireFailed, cancelled: t.hireCancelled };
  const count = (value: HireStatus) => items.filter((hire) => hire.status === value).length;
  return <section className="v4-screen" aria-labelledby="v4-hires-title">
    <div className="v4-page-head"><div><p className="v4-eyebrow">{t.onPage} · {items.length} {t.profiles}</p><h1 id="v4-hires-title">{t.manageOnboarding}</h1><p>{t.hiresSubtitle}</p></div><button type="button" className="v4-primary-button" disabled={!onCreate} onClick={onCreate}>{t.createOnboarding}</button></div>
    <div className="v4-stats" aria-label={t.onPage}>
      {(['learning', 'done', 'provisioning', 'failed'] as const).map((kind) => <button className="v4-stat" key={kind} type="button" aria-pressed={status === kind} onClick={() => onStatus(status === kind ? 'all' : kind)}><span>{{ learning: t.learning, done: t.done, provisioning: t.provisioning, failed: t.attention }[kind]}</span><strong>{count(kind)}</strong><small>{t.onPage}</small></button>)}
    </div>
    <div className="v4-toolbar v4-hires-toolbar"><label className="v4-search"><span className="v4-visually-hidden">{t.searchHires}</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.searchHiresPlaceholder} /></label>
      <div className="v4-position-typeahead" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onPositionClose?.(); }}>
        <label className="v4-visually-hidden" htmlFor="v4-position-filter">{t.filterPosition}</label>
        <input id="v4-position-filter" role="combobox" aria-label={t.filterPosition} aria-autocomplete="list" aria-expanded={positionLookupOpen} aria-controls="v4-position-options" value={positionQuery} placeholder={t.allPositions} onChange={(event) => onPositionQuery?.(event.target.value)} onFocus={onPositionFocus} onKeyDown={(event) => { if (event.key === 'Escape') onPositionClose?.(); }} />
        {selectedPosition && <button type="button" className="v4-position-clear" aria-label={t.clearPosition} onClick={onPositionClear}>×</button>}
        {positionLookupOpen && <div id="v4-position-options" className="v4-position-options" role="listbox" aria-label={t.filterPosition}>
          {positionLookupLoading && <p role="status">{t.loading}</p>}
          {!positionLookupLoading && positionLookupError && <p role="alert">{translateV4Error(positionLookupError, locale)}</p>}
          {!positionLookupLoading && !positionLookupError && positionOptions.map((position) => <button type="button" role="option" aria-selected={selectedPosition?.id === position.id} key={position.id} onClick={() => onPositionSelect?.(position)}>{position.name}</button>)}
          {!positionLookupLoading && !positionLookupError && !positionOptions.length && <p>{t.noMatchingPositions}</p>}
        </div>}
      </div>
      <label className="v4-filter"><span className="v4-visually-hidden">{t.filterStatus}</span><select value={status} onChange={(event) => onStatus(event.target.value as HireStatus | 'all')}><option value="all">{t.allStatuses}</option>{Object.entries(hireStatus).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <button type="button" className="v4-secondary-button" onClick={() => { onSearch(''); onStatus('all'); onPositionClear?.(); }}>{t.reset}</button>
    </div>
    <p className="v4-list-meta" aria-live="polite">{t.showing} {items.length} {t.profiles} · {t.onPage.toLowerCase()}</p>
    <div className="v4-table-wrap"><table aria-label={t.employee}><thead><tr><th>{t.employee}</th><th>{t.position}</th><th>{t.start}</th><th>{t.progress}</th><th>{t.quizScores}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead><tbody>{items.map((hire) => <tr key={hire.id}><td><strong>{hire.name || hire.employeeId}</strong></td><td>{hire.positionName}</td><td>{hire.startDate}</td><td><div className="v4-progress-copy"><strong>{hire.doneDays}/{hire.totalDays} {t.days}</strong><span>{hire.totalDays ? `${Math.round(hire.doneDays / hire.totalDays * 100)}%` : '0%'}</span></div><div className="v4-mini-progress"><span style={{ width: `${hire.totalDays ? Math.min(100, Math.round(hire.doneDays / hire.totalDays * 100)) : 0}%` }} /></div></td><td>{Object.values(hire.scores).length ? <div className="v4-score-strip">{Object.values(hire.scores).slice(0, 3).map((score, index) => <span className="v4-score" key={index}>{score.first}</span>)}</div> : <span className="v4-muted">{t.noQuizScores}</span>}</td><td><span className={`v4-badge v4-badge-${hire.status}`}>{hireStatus[hire.status]}</span></td><td><button type="button" className="v4-row-button" disabled={!onOpen} onClick={() => onOpen?.(hire)}>{t.viewRoadmap}</button></td></tr>)}</tbody></table>{!items.length && <ErrorOrEmpty loading={loading} error={error} empty={t.noHires} locale={locale} onReload={onReload} />}</div>
    <Pager canPrevious={canPrevious} canNext={canNext} onPrevious={onPrevious} onNext={onNext} locale={locale} />
  </section>;
}

export function PositionsCatalogTable(props: PositionsCatalogTableProps) {
  const { items, loading, error, search, onSearch, status, onStatus, canPrevious, canNext, onPrevious, onNext, onReload, onCreate, onOpen, onCopy, onDisable, locale = 'vi' } = props;
  const t = v4CatalogCopy(locale);
  const positionStatus: Record<PositionStatus, string> = { draft: t.positionDraft, ready: t.positionReady, disabled: t.positionDisabled };
  return <section className="v4-screen" aria-labelledby="v4-positions-title">
    <div className="v4-page-head"><div><p className="v4-eyebrow">{t.templateEyebrow}</p><h1 id="v4-positions-title">{t.templateTitle}</h1><p>{t.templateSubtitle}</p></div><button type="button" className="v4-primary-button" disabled={!onCreate} onClick={onCreate}>{t.createTemplate}</button></div>
    <div className="v4-toolbar"><label className="v4-search"><span className="v4-visually-hidden">{t.searchPosition}</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.searchPosition} /></label>
      <label className="v4-filter"><span className="v4-visually-hidden">{t.filterTemplateStatus}</span><select value={status} onChange={(event) => onStatus(event.target.value as PositionStatus | 'all')}><option value="all">{t.allStatuses}</option>{Object.entries(positionStatus).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <button type="button" className="v4-secondary-button" onClick={() => { onSearch(''); onStatus('all'); }}>{t.reset}</button>
    </div>
    <p className="v4-list-meta" aria-live="polite">{t.showing} {items.length} {t.positions} · {t.onPage.toLowerCase()}</p>
    <div className="v4-table-wrap"><table aria-label={t.templateTitle}><thead><tr><th>{t.position}</th><th>{t.stageWeeks}</th><th>{t.dayItems}</th><th>{t.lessons}</th><th>{t.questions}</th><th>{t.missingAnswers}</th><th>{t.inUse}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead><tbody>{items.map((position) => <tr key={position.id}><td><strong>{position.name}</strong></td><td>{position.weeks}</td><td>{position.days}</td><td>{position.lessons}</td><td>{position.questions}</td><td>{position.missingAnswers}</td><td>{position.inUse}</td><td><span className={`v4-badge v4-badge-${position.status}`}>{positionStatus[position.status]}</span></td><td><button type="button" className="v4-row-button" disabled={!onOpen} onClick={() => onOpen?.(position)}>{t.openTemplate}</button><button type="button" className="v4-row-button" disabled={!onCopy} onClick={() => onCopy?.(position)}>Copy</button>{position.status !== 'disabled' && <button type="button" className="v4-row-button" disabled={!onDisable} onClick={() => onDisable?.(position)}>Ngừng dùng</button>}</td></tr>)}</tbody></table>{!items.length && <ErrorOrEmpty loading={loading} error={error} empty={t.noPositions} locale={locale} onReload={onReload} />}</div>
    <Pager canPrevious={canPrevious} canNext={canNext} onPrevious={onPrevious} onNext={onNext} locale={locale} />
  </section>;
}
