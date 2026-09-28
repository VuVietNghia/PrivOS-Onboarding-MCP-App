import { useEffect, useMemo, useRef, useState } from 'react';
import { answerLabels, type OptionDraft } from '../../domain/template-draft';
import type { TemplateTree } from '../../domain/models';
import type { ContentItem, Day, Lesson, Question } from '../../domain/models';
import type { FileMetadata, FilesGateway } from '../../data/files';
import { validateReady, type ReadinessIssue } from '../../domain/template-readiness';
import { describeError } from '../../domain/errors';
import { WeekRail } from './WeekRail';
import { DayEditor } from './DayEditor';
import type { IdGenerator } from '../../../../shared/ports/effects';
import type { FocusTarget } from '../../../ports/presentation';

interface TemplateBuilderBaseProps {
  initial: TemplateTree;
  initialName: string;
  initialStatus?: 'draft' | 'ready' | 'disabled';
  filesGateway?: FilesGateway;
  positionId?: string;
  ids: IdGenerator;
  focus: FocusTarget;
}
export type TemplateBuilderProps = TemplateBuilderBaseProps & (
  | { mode: 'preview' }
  | { mode?: 'live'; onSave: (tree: TemplateTree, name: string, status: 'draft' | 'ready', positionId?: string) => Promise<string | void> }
);

interface PendingFile { lessonId: string; file: File; uploaded?: FileMetadata }

function draftId(ids: IdGenerator): string { return `draft:${ids.next()}`; }

const issueLabels: Record<string, string> = {
  POSITION_NAME: 'Tên vị trí bắt buộc', NO_WEEK: 'Thêm ít nhất một tuần', WEEK_NAME: 'Đặt tên cho tuần',
  EMPTY_WEEK: 'Thêm ngày vào tuần', DAY_NAME: 'Đặt tên cho ngày', EMPTY_DAY: 'Thêm nội dung hợp lệ cho ngày',
  LESSON_TITLE: 'Đặt tiêu đề bài học', LESSON_CONTENT: 'Nhập nội dung bài học',
  QUESTION_CONTENT: 'Nhập nội dung câu hỏi', OPTION_COUNT: 'Câu hỏi cần 2–10 lựa chọn',
  OPTION_EMPTY: 'Điền nội dung lựa chọn', ANSWER_INVALID: 'Chọn đáp án đúng hợp lệ',
};

function initialOptions(tree: TemplateTree, ids: IdGenerator): Record<string, OptionDraft[]> {
  return Object.fromEntries(tree.items.filter((item): item is Question => item.kind === 'question').map((question) => [question.id,
    question.options.map((text, index) => ({ id: draftId(ids), text, correct: question.correctLabels.includes(String.fromCharCode(97 + index)) }))]));
}

export function TemplateBuilder(props: TemplateBuilderProps) {
  const { initial, initialName } = props;
  const preview = props.mode === 'preview';
  const [tree, setTree] = useState<TemplateTree>(() => ({ weeks: initial.weeks.map((week) => ({ ...week })), items: initial.items.map((item) => ({ ...item })) }));
  const [name, setName] = useState(initialName);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(initial.weeks[0]?.id ?? null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(initial.items.find((item) => item.kind === 'day')?.id ?? null);
  const [optionsByQuestion, setOptionsByQuestion] = useState<Record<string, OptionDraft[]>>(() => initialOptions(initial, props.ids));
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [deletingWeekId, setDeletingWeekId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const editRevision = useRef(0);
  const saving = useRef(false);
  const uploadRunning = useRef(false);
  const pendingRef = useRef<PendingFile[]>([]);
  const treeRef = useRef(tree);
  const nameRef = useRef(name);
  const positionIdRef = useRef(props.positionId);
  const createdHere = useRef(!props.positionId);
  const savedStatus = useRef<'draft' | 'ready'>(props.initialStatus === 'ready' ? 'ready' : 'draft');
  const syncPending = () => setPendingFiles([...pendingRef.current]);
  useEffect(() => { if (props.positionId) positionIdRef.current = props.positionId; }, [props.positionId]);
  const issues = useMemo(() => validateReady(tree, name), [tree, name]);
  const days = tree.items.filter((item): item is Day => item.kind === 'day');
  const selectedWeek = tree.weeks.find((week) => week.id === selectedWeekId) ?? null;
  const selectedDay = days.find((day) => day.id === selectedDayId && day.stageId === selectedWeekId) ?? null;
  const dayChildren = tree.items.filter((item): item is Lesson | Question => item.kind !== 'day' && item.parentId === selectedDayId);
  const deletingDays = days.filter((day) => day.stageId === deletingWeekId);
  useEffect(() => {
    if (!focusId) return;
    props.focus.focus(focusId);
    setFocusId(null);
  }, [focusId, selectedWeekId, selectedDayId, props.focus]);
  const focusIssue = (issue: ReadinessIssue) => {
    if (issue.code === 'POSITION_NAME') { setFocusId('v4-builder-position-name'); return; }
    if (issue.code === 'NO_WEEK' || !issue.itemId) { setFocusId('v4-builder-add-week'); return; }
    const week = tree.weeks.find((entry) => entry.id === issue.itemId);
    if (week) {
      setSelectedWeekId(week.id);
      setSelectedDayId(days.find((day) => day.stageId === week.id)?.id ?? null);
      setFocusId(`v4-builder-${week.id}-${issue.code === 'EMPTY_WEEK' ? 'days' : 'name'}`);
      return;
    }
    const item = tree.items.find((entry) => entry.id === issue.itemId);
    if (!item) return;
    const day = item.kind === 'day' ? item : days.find((entry) => entry.id === item.parentId);
    if (!day) return;
    setSelectedWeekId(day.stageId); setSelectedDayId(day.id);
    const field = issue.code === 'EMPTY_DAY' ? 'items' : issue.code.startsWith('OPTION_') || issue.code === 'ANSWER_INVALID' ? 'options' : issue.field;
    setFocusId(`v4-builder-${item.id}-${field}`);
  };
  const editTree = (next: TemplateTree) => { treeRef.current = next; editRevision.current += 1; setTree(next); setSaveState('dirty'); };

  const addWeek = () => {
    const id = draftId(props.ids);
    const order = Math.max(-1, ...tree.weeks.map((week) => week.order)) + 1;
    editTree({ ...tree, weeks: [...tree.weeks, { id, name: `Tuần ${order + 1}`, order }] });
    setSelectedWeekId(id); setSelectedDayId(null);
  };
  const addDay = (weekId: string) => {
    const order = Math.max(0, ...days.map((day) => day.order)) + 1;
    const id = draftId(props.ids);
    editTree({ ...tree, items: [...tree.items, { id, kind: 'day', name: `Ngày ${order}`, stageId: weekId, order, parentId: null, content: '' }] });
    setSelectedWeekId(weekId); setSelectedDayId(id);
  };
  const addLesson = () => {
    if (!selectedDay) return;
    const order = dayChildren.filter((item) => item.kind === 'lesson').length;
    editTree({ ...tree, items: [...tree.items, { id: draftId(props.ids), kind: 'lesson', name: `Bài học ${order + 1}`, stageId: selectedDay.stageId, order, parentId: selectedDay.id, content: '', attachments: [], videos: [], read: false }] });
  };
  const addQuestion = () => {
    if (!selectedDay) return;
    const id = draftId(props.ids);
    const options = [{ id: draftId(props.ids), text: '', correct: false }, { id: draftId(props.ids), text: '', correct: false }];
    const order = dayChildren.filter((item) => item.kind === 'question').length;
    editTree({ ...tree, items: [...tree.items, { id, kind: 'question', name: `Câu hỏi ${order + 1}`, stageId: selectedDay.stageId, order, parentId: selectedDay.id, content: '', options: ['', ''], correctLabels: [], explanation: '', selectedLabels: [], correct: null }] });
    setOptionsByQuestion((current) => ({ ...current, [id]: options }));
  };
  const updateItem = (next: ContentItem) => editTree({ ...tree, items: tree.items.map((item) => item.id === next.id ? next : item) });
  const updateAttachments = (lessonId: string, change: (lesson: Lesson) => Lesson) => {
    editTree({ ...treeRef.current, items: treeRef.current.items.map((item) => item.id === lessonId && item.kind === 'lesson' ? change(item) : item) });
  };
  const attachFile = (lessonId: string, file: FileMetadata) => updateAttachments(lessonId, (lesson) => ({ ...lesson,
    attachments: lesson.attachments.some((ref) => ref.id === file.id) ? lesson.attachments :
      [...lesson.attachments, { id: file.id, name: file.name, ...(file.mimeType ? { mimeType: file.mimeType } : {}), raw: file.raw }],
  }));
  const unlinkFile = (lessonId: string, fileId: string) => updateAttachments(lessonId, (lesson) => ({ ...lesson,
    attachments: lesson.attachments.filter((ref) => ref.id !== fileId),
  }));
  const updateQuestion = (next: Question, options: OptionDraft[]) => {
    setOptionsByQuestion((current) => ({ ...current, [next.id]: options }));
    updateItem({ ...next, options: options.map((option) => option.text), correctLabels: answerLabels(options) });
  };
  const removeItem = (id: string) => {
    if (uploadRunning.current) return;
    const removed = new Set<string>([id]);
    for (const item of tree.items) if (item.parentId === id) removed.add(item.id);
    pendingRef.current = pendingRef.current.filter((entry) => !removed.has(entry.lessonId));
    syncPending();
    editTree({ ...tree, items: tree.items.filter((item) => !removed.has(item.id)) });
    if (id === selectedDayId) setSelectedDayId(null);
  };
  const removeWeek = () => {
    if (uploadRunning.current || !deletingWeekId || tree.weeks.length <= 1) { setDeletingWeekId(null); return; }
    const removedDayIds = new Set(deletingDays.map((day) => day.id));
    const nextItems = tree.items.filter((item) => item.stageId !== deletingWeekId && !removedDayIds.has(item.parentId ?? ''));
    const nextWeeks = tree.weeks.filter((week) => week.id !== deletingWeekId).map((week, order) => ({ ...week, order }));
    const remainingIds = new Set(nextItems.map((item) => item.id));
    pendingRef.current = pendingRef.current.filter((entry) => remainingIds.has(entry.lessonId));
    syncPending();
    editTree({ weeks: nextWeeks, items: nextItems });
    setSelectedWeekId(nextWeeks[0]?.id ?? null);
    setSelectedDayId(nextItems.find((item) => item.kind === 'day' && item.stageId === nextWeeks[0]?.id)?.id ?? null);
    setDeletingWeekId(null);
  };
  const processUploads = async (currentName: string) => {
    if (props.mode === 'preview' || !props.filesGateway || !currentName.trim() || saving.current || uploadRunning.current || !pendingRef.current.length) return;
    uploadRunning.current = true;
    saving.current = true;
    setUploading(true);
    setUploadError('');
    setSaveState('saving');
    try {
      let didSave = false;
      while (pendingRef.current.length) {
        const pending = pendingRef.current[0];
        if (!treeRef.current.items.some((item) => item.kind === 'lesson' && item.id === pending.lessonId)) {
          pendingRef.current.shift(); syncPending(); continue;
        }
        if (!positionIdRef.current) {
          const createdId = await props.onSave(treeRef.current, currentName.trim(), 'draft');
          if (!createdId) throw new Error('FILE_LOCATION_INVALID');
          positionIdRef.current = createdId;
        }
        if (!pending.uploaded) pending.uploaded = await props.filesGateway.upload(positionIdRef.current, pending.file);
        attachFile(pending.lessonId, pending.uploaded);
        const savedRevision = editRevision.current;
        await props.onSave(treeRef.current, nameRef.current.trim(), savedStatus.current, positionIdRef.current);
        didSave = true;
        pendingRef.current.shift(); syncPending();
        setSaveState(editRevision.current === savedRevision ? 'saved' : 'dirty');
      }
      if (!didSave) setSaveState('dirty');
    } catch {
      setUploadError(`Không tải hoặc lưu được ${pendingRef.current[0]?.file.name ?? 'file'}. Thử lại.`);
      setSaveState('error');
    } finally {
      uploadRunning.current = false;
      saving.current = false;
      setUploading(false);
    }
  };
  const selectFile = (lessonId: string, file: File) => {
    pendingRef.current.push({ lessonId, file });
    syncPending();
    setSaveState('dirty');
    if (nameRef.current.trim()) void processUploads(nameRef.current);
  };
  const save = async (status: 'draft' | 'ready') => {
    if (props.mode === 'preview') return;
    if (saving.current || pendingRef.current.length || (status === 'ready' && issues.length)) return;
    saving.current = true;
    const savedRevision = editRevision.current;
    setSaveState('saving'); setSaveError('');
    try {
      const positionId = await props.onSave(treeRef.current, nameRef.current.trim(), status, positionIdRef.current);
      if (positionId) positionIdRef.current = positionId;
      savedStatus.current = status;
      setSaveState(editRevision.current === savedRevision ? 'saved' : 'dirty');
    }
    catch (error: unknown) { setSaveError(describeError(error).message); setSaveState('error'); }
    finally { saving.current = false; if (pendingRef.current.length) void processUploads(nameRef.current); }
  };

  return <section className="v4-template-builder" aria-label="Biên soạn template">
    {preview && <p className="v4-builder-preview-note" role="note">Thử giao diện P2: thay đổi chỉ tồn tại khi màn này đang mở, chưa ghi vào PrivOS Lists. Lưu và publish chưa khả dụng.</p>}
    <div className="v4-builder-title"><div><small>Template studio / {props.positionId ? 'chỉnh sửa' : 'tạo mới'}</small><h1>{props.positionId ? 'Chỉnh sửa template onboarding' : 'Tạo template onboarding'}</h1><p>Biên soạn tuần, ngày, bài học và câu hỏi ôn tập.</p></div><span>{props.initialStatus === 'ready' ? 'Sẵn sàng' : props.initialStatus === 'disabled' ? 'Ngừng dùng' : 'Bản nháp'}</span></div>
    <div className="v4-builder-grid">
      <WeekRail weeks={tree.weeks} days={days} selectedWeekId={selectedWeekId} selectedDayId={selectedDayId} onSelectWeek={(id) => { setSelectedWeekId(id); setSelectedDayId(days.find((day) => day.stageId === id)?.id ?? null); }} onSelectDay={setSelectedDayId} onAddWeek={addWeek} onAddDay={addDay} />
      <main className="v4-builder-workspace">
        <section className="v4-builder-intro"><small>01 / Thông tin template</small><h2>Template này dành cho vị trí nào?</h2><label>Tên vị trí<input id="v4-builder-position-name" value={name} onChange={(event) => { editRevision.current += 1; nameRef.current = event.target.value; setName(event.target.value); setSaveState('dirty'); if (pendingRef.current.length) void processUploads(event.target.value); }} placeholder="Ví dụ: Intern Backend Developer" /></label></section>
        {selectedWeek && <section className="v4-builder-week-editor"><label>Tên tuần<input id={`v4-builder-${selectedWeek.id}-name`} value={selectedWeek.name} onChange={(event) => editTree({ ...tree, weeks: tree.weeks.map((week) => week.id === selectedWeek.id ? { ...week, name: event.target.value } : week) })} /></label><small>Tuần được lưu thành item trong PrivOS List.</small><button type="button" disabled={tree.weeks.length <= 1 || uploading} onClick={() => setDeletingWeekId(selectedWeek.id)}>Xóa tuần</button></section>}
        {selectedWeek && !selectedDay && <section className="v4-builder-empty"><h2>Tuần này chưa có ngày học</h2><p>Thêm ngày đầu tiên để bắt đầu biên soạn.</p><button type="button" onClick={() => addDay(selectedWeek.id)}>Thêm ngày</button></section>}
        {selectedDay && <DayEditor day={selectedDay} children={dayChildren} optionsByQuestion={optionsByQuestion} onUpdate={updateItem} onRemove={removeItem} onAddLesson={addLesson} onAddQuestion={addQuestion} onQuestionChange={updateQuestion} ids={props.ids} filesGateway={preview ? undefined : props.filesGateway} positionId={props.positionId} onSelectFile={!preview && createdHere.current ? selectFile : undefined} uploadDisabled={uploading || saving.current} onAttach={attachFile} onUnlink={unlinkFile} />}
      </main>
      <aside className="v4-builder-readiness" aria-label="Kiểm tra template"><h2>Kiểm tra trước khi dùng</h2><p>{preview ? 'Kiểm tra các mục còn thiếu trong bản thử giao diện.' : 'Lưu nháp bất kỳ lúc nào.'}</p><strong>{issues.length ? `${issues.length} mục cần bổ sung` : 'Đủ điều kiện'}</strong><ul>{issues.map((issue, index) => <li key={`${issue.code}:${issue.itemId ?? ''}:${index}`}><button type="button" onClick={() => focusIssue(issue)}>{issueLabels[issue.code] ?? 'Kiểm tra cấu trúc template'}</button></li>)}</ul></aside>
    </div>
    <div className="v4-builder-savebar"><span role="status">{preview ? 'Chế độ thử giao diện · chưa lưu' : { idle: 'Chưa thay đổi', dirty: 'Chưa lưu', saving: 'Đang lưu', saved: 'Đã lưu', error: 'Lưu thất bại' }[saveState]}</span>{pendingFiles.length > 0 && !name.trim() && <p>{pendingFiles.map((entry) => entry.file.name).join(', ')}: nhập tên vị trí để tải file.</p>}{uploadError && <p role="alert">{uploadError} <button type="button" onClick={() => void processUploads(nameRef.current)}>Thử lại tải file</button></p>}{saveError && <p role="alert">{saveError}</p>}<div><button type="button" disabled={preview || saving.current || pendingFiles.length > 0} onClick={() => void save('draft')}>Lưu nháp</button><button type="button" disabled={preview || saving.current || pendingFiles.length > 0 || issues.length > 0} onClick={() => void save('ready')}>Sẵn sàng</button></div></div>
    {deletingWeekId && <div role="dialog" aria-modal="true" aria-label="Xác nhận xóa tuần" className="v4-builder-dialog"><h2>Xóa tuần?</h2><p>Tuần này có {deletingDays.length} ngày. Các bài học và câu hỏi trong tuần cũng sẽ bị xóa.</p><button type="button" onClick={() => setDeletingWeekId(null)}>Giữ lại</button><button type="button" disabled={uploading} onClick={removeWeek}>Xác nhận xóa</button></div>}
  </section>;
}
