import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import type { Catalogs } from '../data/catalogs';
import { lookupUser, listRoomMembers } from '../data/room-members';
import type { Position, RoomBinding, TemplateTree } from '../domain/models';
import type { RoomMember } from '../domain/pick-employee';
import { isWorkingDay } from '../domain/working-days';
import { describeError } from '../domain/errors';
import { provisionV4, templateFingerprint, type PreparedProvisionV4, type ProvisionProgress } from '../flows/provision-v4';

export interface ProvisionV4FormProps {
  app: McpApp;
  binding: RoomBinding;
  catalogs: Catalogs;
  actorRoles: readonly string[];
  onDone: () => void;
}

export function ProvisionV4Form({ app, binding, catalogs, actorRoles, onDone }: ProvisionV4FormProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [members, setMembers] = useState<RoomMember[] | null | undefined>(undefined);
  const [positionId, setPositionId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [username, setUsername] = useState('');
  const [startDate, setStartDate] = useState('');
  const [tree, setTree] = useState<TemplateTree | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<ProvisionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    void loadPositions().catch((cause: unknown) => { if (active) setError(describeError(cause).message); });
    void listRoomMembers(app, binding.roomId).then((result) => { if (active) setMembers(result); })
      .catch(() => { if (active) setMembers(null); });
    return () => { active = false; };
  }, [app, binding.roomId, catalogs]);

  useEffect(() => {
    let active = true;
    setTree(null);
    if (!positionId) return () => { active = false; };
    const position = positions.find((entry) => entry.id === positionId);
    if (!position) return () => { active = false; };
    setLoadingTree(true);
    void catalogs.template(position.templateListId).then((value) => { if (active) setTree(value); })
      .catch((cause: unknown) => { if (active) setError(describeError(cause).message); })
      .finally(() => { if (active) setLoadingTree(false); });
    return () => { active = false; };
  }, [catalogs, positionId, positions]);

  const position = positions.find((entry) => entry.id === positionId);
  const days = tree?.items.filter((item) => item.kind === 'day').length ?? 0;
  const lessons = tree?.items.filter((item) => item.kind === 'lesson').length ?? 0;
  const questions = tree?.items.filter((item) => item.kind === 'question').length ?? 0;
  const canSubmit = !pending && !!position && !!tree && !!startDate && members !== undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (!position || !tree || !isWorkingDay(startDate)) { setError('Chọn vị trí, template và ngày làm việc hợp lệ.'); return; }
    setPending(true);
    try {
      let targetId = employeeId;
      let targetName = members?.find((member) => member.id === employeeId)?.name ?? username.trim();
      if (members === null) {
        const found = await lookupUser(app, username.trim());
        if (found.kind !== 'found') throw new Error('EMPLOYEE_NOT_FOUND');
        targetId = found.member.id; targetName = found.member.name;
      }
      if (!targetId || !targetName) throw new Error('EMPLOYEE_NOT_FOUND');
      const freshPosition = await catalogs.position(position.id);
      if (freshPosition.status !== 'ready') throw new Error('POSITION_NOT_READY');
      const freshTree = await catalogs.template(freshPosition.templateListId);
      if (!operationId.current) operationId.current = crypto.randomUUID();
      const prepared: PreparedProvisionV4 = { input: { positionId: freshPosition.id, employeeId: targetId,
        employeeName: targetName, startDate, operationId: operationId.current }, position: freshPosition,
        tree: freshTree, fingerprint: await templateFingerprint(freshTree) };
      await provisionV4(app, binding, prepared, actorRoles, setProgress, catalogs);
      operationId.current = null;
      onDone();
    } catch (cause) { setError(describeError(cause).message); }
    finally { setPending(false); setProgress(null); }
  };

  return <section className="v4-screen" aria-labelledby="v4-provision-title">
    <div className="v4-page-head"><div><p className="v4-eyebrow">Onboarding</p><h1 id="v4-provision-title">Tạo onboarding</h1><p>Chọn nhân sự, vị trí và ngày bắt đầu.</p></div></div>
    <div className="v4-builder-grid"><form className="v4-builder-workspace v4-builder-intro" onSubmit={(event) => void submit(event)}>
      {members === undefined && <p role="status">Đang tải thành viên room</p>}
      {members && <label>Nhân sự<select value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); operationId.current = null; }}>
        <option value="">Chọn nhân sự</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
      {members === null && <label>Username nhân sự<input value={username} onChange={(event) => { setUsername(event.target.value); operationId.current = null; }} placeholder="username trong PrivOS" /></label>}
      <label>Vị trí<select value={positionId} onChange={(event) => { setPositionId(event.target.value); operationId.current = null; }}>
        <option value="">Chọn vị trí sẵn sàng</option>{positions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label>Ngày bắt đầu<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); operationId.current = null; }} /></label>
      {startDate && !isWorkingDay(startDate) && <p role="alert">Ngày bắt đầu phải là thứ 2 đến thứ 6.</p>}
      {error && <p role="alert">{error}</p>}
      {progress && <p role="status">{progress.phase}: {progress.completed}/{progress.total}</p>}
      <button type="submit" className="v4-primary-button" disabled={!canSubmit}>{pending ? 'Đang khởi tạo…' : 'Tạo onboarding'}</button>
    </form><aside className="v4-builder-readiness"><h2>Tóm tắt</h2>{loadingTree && <p>Đang tải template</p>}
      {position && tree && <><p>{position.name}</p><p>{tree.weeks.length} tuần · {days} ngày · {lessons} bài học · {questions} câu hỏi</p></>}
      {!position && <p>Chọn vị trí để xem nội dung.</p>}</aside></div>
  </section>;
}
