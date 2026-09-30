import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Catalogs } from '../data/catalogs';
import { localTodayIso } from '../domain/local-date';
import type { Position, RoomBinding, TemplateTree } from '../domain/models';
import { pickEmployee, type RoomMember } from '../domain/pick-employee';
import { isWorkingDay } from '../domain/working-days';
import type { PreparedProvisionV4, ProvisionProgress } from '../ports/provision';
import type { OnboardingServices } from '../ports/ui-services';
import { toUiError, type UiError } from '../../i18n/ui-error';
import { getErrorMessage } from '../../i18n/error-message';
import { ProvisionProgressView } from '../components/ProvisionProgressView';

export interface ProvisionV4FormProps {
  binding: RoomBinding;
  catalogs: Catalogs;
  services: Pick<OnboardingServices, 'provision' | 'members' | 'clock' | 'ids'>;
  onDone: () => void;
}

export function ProvisionV4Form({ binding, catalogs, services, onDone }: ProvisionV4FormProps) {
  const { t } = useTranslation('provision');
  const { t: errorT } = useTranslation('errors');
  const [positions, setPositions] = useState<Position[]>([]);
  const [members, setMembers] = useState<RoomMember[] | null | undefined>(undefined);
  const [positionId, setPositionId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [username, setUsername] = useState('');
  const [startDate, setStartDate] = useState(() => localTodayIso(services.clock.now()));
  const [tree, setTree] = useState<TemplateTree | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<ProvisionProgress | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [memberError, setMemberError] = useState<UiError | null>(null);
  const [memberRetry, setMemberRetry] = useState(0);
  const operationId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadPositions = async () => {
      const all: Position[] = [];
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await catalogs.positions({ text: '', status: 'ready' }, cursor);
        all.push(...page.items);
        if (page.nextCursor && seen.has(page.nextCursor)) throw new Error('PAGINATION_INVALID');
        if (page.nextCursor) seen.add(page.nextCursor);
        cursor = page.nextCursor ?? undefined;
      } while (cursor && all.length < 10_000);
      if (active) setPositions(all);
    };
    void loadPositions().catch((cause: unknown) => { if (active) setError(toUiError(cause)); });
    return () => { active = false; };
  }, [catalogs]);

  useEffect(() => {
    let active = true;
    setMembers(undefined);
    setMemberError(null);
    void services.members.list()
      .then((result) => { if (active) setMembers(result); })
      .catch((cause: unknown) => { if (active) setMemberError(toUiError(cause)); });
    return () => { active = false; };
  }, [binding.roomId, memberRetry, services]);

  useEffect(() => {
    setEmployeeId('');
    setUsername('');
    operationId.current = null;
  }, [binding.roomId]);

  useEffect(() => {
    let active = true;
    setTree(null);
    if (!positionId) return () => { active = false; };
    const position = positions.find((entry) => entry.id === positionId);
    if (!position) return () => { active = false; };
    setLoadingTree(true);
    void catalogs.template(position.templateListId).then((value) => { if (active) setTree(value); })
      .catch((cause: unknown) => { if (active) setError(toUiError(cause)); })
      .finally(() => { if (active) setLoadingTree(false); });
    return () => { active = false; };
  }, [catalogs, positionId, positions]);

  const position = positions.find((entry) => entry.id === positionId);
  const days = tree?.items.filter((item) => item.kind === 'day').length ?? 0;
  const lessons = tree?.items.filter((item) => item.kind === 'lesson').length ?? 0;
  const questions = tree?.items.filter((item) => item.kind === 'question').length ?? 0;
  const canSubmit = !pending && !!position && !!tree && isWorkingDay(startDate) && members !== undefined && !memberError;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (members === undefined || memberError) return;
    if (!position || !tree || !isWorkingDay(startDate)) { setError({ code: 'PROVISION_INPUT_INVALID' }); return; }
    setPending(true);
    try {
      const selectedMember = members?.find((member) => member.id === employeeId);
      let targetId = selectedMember?.id ?? '';
      let targetName = selectedMember?.name ?? '';
      if (members === null) {
        const found = await services.members.lookup(username.trim());
        const picked = pickEmployee(username, found);
        if (!picked.ok) { setError({ code: picked.code }); return; }
        targetId = picked.employeeId;
        targetName = found.kind === 'found' ? found.member.name : username.trim();
      }
      if (!targetId || !targetName) throw new Error('EMPLOYEE_NOT_FOUND');
      const freshPosition = await catalogs.position(position.id);
      if (freshPosition.status !== 'ready') throw new Error('POSITION_NOT_READY');
      const freshTree = await catalogs.template(freshPosition.templateListId);
      if (!operationId.current) operationId.current = services.ids.next();
      const prepared: PreparedProvisionV4 = { input: { positionId: freshPosition.id, employeeId: targetId,
        employeeName: targetName, startDate, operationId: operationId.current }, position: freshPosition,
        tree: freshTree, fingerprint: await services.provision.fingerprint(freshTree) };
      await services.provision.start(prepared, setProgress);
      operationId.current = null;
      onDone();
    } catch (cause) { setError(toUiError(cause)); }
    finally { setPending(false); setProgress(null); }
  };

  return <section className="v4-screen" aria-labelledby="v4-provision-title">
    <div className="v4-page-head"><div><p className="v4-eyebrow">{t('eyebrow')}</p><h1 id="v4-provision-title">{t('title')}</h1><p>{t('subtitle')}</p></div></div>
    <div className="v4-provision-grid"><form className="v4-provision-form" onSubmit={(event) => void submit(event)}>
      {members === undefined && !memberError && <p role="status">{t('loadingMembers')}</p>}
      {members && <label>{t('employee')}<select value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); operationId.current = null; }}>
        <option value="">{t('selectEmployee')}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name} (@{member.username})</option>)}</select></label>}
      {members === null && <label>{t('username')}<input value={username} onChange={(event) => { setUsername(event.target.value); operationId.current = null; }} placeholder={t('usernamePlaceholder')} /></label>}
      <label>{t('position')}<select value={positionId} onChange={(event) => { setPositionId(event.target.value); operationId.current = null; }}>
        <option value="">{t('selectPosition')}</option>{positions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label>{t('startDate')}<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); operationId.current = null; }} /></label>
      {startDate && !isWorkingDay(startDate) && <p role="alert">{t('workingDay')}</p>}
      {memberError && <><p role="alert">{getErrorMessage(memberError, errorT)}</p><button className="v4-secondary-button" type="button" onClick={() => setMemberRetry((value) => value + 1)}>{t('reloadMembers')}</button></>}
      {error && <p role="alert">{getErrorMessage(error, errorT)}</p>}
      {progress && <ProvisionProgressView progress={progress} />}
      <button type="submit" className="v4-primary-button" disabled={!canSubmit}>{pending ? t('submitting') : t('submit')}</button>
    </form><aside className="v4-builder-readiness"><h2>{t('summary')}</h2>{loadingTree && <p>{t('loadingTemplate')}</p>}
      {position && tree && <><p>{position.name}</p><p>{t('summaryCounts', { weeks: tree.weeks.length, days, lessons, questions })}</p></>}
      {!position && <p>{t('choosePosition')}</p>}</aside></div>
  </section>;
}
