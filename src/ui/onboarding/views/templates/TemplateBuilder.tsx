import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { answerLabels, type OptionDraft } from '../../domain/template-draft';
import type { TemplateTree } from '../../domain/models';
import type { ContentItem, Day, Lesson, Question } from '../../domain/models';
import type { FileMetadata, FilesGateway } from '../../data/files';
import { validateReady, type ReadinessIssue } from '../../domain/template-readiness';
import { WeekRail } from './WeekRail';
import { DayEditor } from './DayEditor';
import type { IdGenerator } from '../../../../shared/ports/effects';
import type { FocusTarget } from '../../../ports/presentation';
import { getErrorMessage } from '../../../i18n/error-message';
import { toUiError, type UiError } from '../../../i18n/ui-error';
import { useDialogFocus } from '../use-dialog-focus';

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

function initialOptions(tree: TemplateTree, ids: IdGenerator): Record<string, OptionDraft[]> {
  return Object.fromEntries(tree.items.filter((item): item is Question => item.kind === 'question').map((question) => [question.id,
    question.options.map((text, index) => ({ id: draftId(ids), text, correct: question.correctLabels.includes(String.fromCharCode(97 + index)) }))]));
}

export function TemplateBuilder(props: TemplateBuilderProps) {
  const { t } = useTranslation('templates');
  const { t: errorT } = useTranslation('errors');
  const { initial, initialName } = props;
  const preview = props.mode === 'preview';
  const [tree, setTree] = useState<TemplateTree>(() => ({ weeks: initial.weeks.map((week) => ({ ...week })), items: initial.items.map((item) => ({ ...item })) }));
  const [name, setName] = useState(initialName);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(initial.weeks[0]?.id ?? null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(initial.items.find((item) => item.kind === 'day')?.id ?? null);
  const [optionsByQuestion, setOptionsByQuestion] = useState<Record<string, OptionDraft[]>>(() => initialOptions(initial, props.ids));
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<UiError | null>(null);
  const [deletingWeekId, setDeletingWeekId] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteKeepRef = useRef<HTMLButtonElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadError, setUploadError] = useState<UiError | null>(null);
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
  useDialogFocus({ open: deletingWeekId !== null, onClose: () => setDeletingWeekId(null), containerRef: deleteDialogRef, initialFocusRef: deleteKeepRef });
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
    editTree({ ...tree, weeks: [...tree.weeks, { id, name: t('defaults.week', { count: order + 1 }), order }] });
    setSelectedWeekId(id); setSelectedDayId(null);
  };
  const addDay = (weekId: string) => {
    const order = Math.max(0, ...days.map((day) => day.order)) + 1;
    const id = draftId(props.ids);
    editTree({ ...tree, items: [...tree.items, { id, kind: 'day', name: t('defaults.day', { count: order }), stageId: weekId, order, parentId: null, content: '' }] });
    setSelectedWeekId(weekId); setSelectedDayId(id);
  };
  const addLesson = () => {
    if (!selectedDay) return;
    const order = dayChildren.filter((item) => item.kind === 'lesson').length;
    editTree({ ...tree, items: [...tree.items, { id: draftId(props.ids), kind: 'lesson', name: t('defaults.lesson', { count: order + 1 }), stageId: selectedDay.stageId, order, parentId: selectedDay.id, content: '', attachments: [], videos: [], read: false }] });
  };
  const addQuestion = () => {
    if (!selectedDay) return;
    const id = draftId(props.ids);
    const options = [{ id: draftId(props.ids), text: '', correct: false }, { id: draftId(props.ids), text: '', correct: false }];
    const order = dayChildren.filter((item) => item.kind === 'question').length;
    editTree({ ...tree, items: [...tree.items, { id, kind: 'question', name: t('defaults.question', { count: order + 1 }), stageId: selectedDay.stageId, order, parentId: selectedDay.id, content: '', options: ['', ''], correctLabels: [], explanation: '', selectedLabels: [], correct: null }] });
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
    setUploadError(null);
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
      setUploadError({ code: 'FILE_UPLOAD_FAILED' });
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
    setSaveState('saving'); setSaveError(null);
    try {
      const positionId = await props.onSave(treeRef.current, nameRef.current.trim(), status, positionIdRef.current);
      if (positionId) positionIdRef.current = positionId;
      savedStatus.current = status;
      setSaveState(editRevision.current === savedRevision ? 'saved' : 'dirty');
    }
    catch (error: unknown) { setSaveError(toUiError(error)); setSaveState('error'); }
    finally { saving.current = false; if (pendingRef.current.length) void processUploads(nameRef.current); }
  };
  const issueLabel = (code: string): string => {
    switch (code) {
      case 'POSITION_NAME': return t('issues.POSITION_NAME');
      case 'NO_WEEK': return t('issues.NO_WEEK');
      case 'WEEK_NAME': return t('issues.WEEK_NAME');
      case 'EMPTY_WEEK': return t('issues.EMPTY_WEEK');
      case 'DAY_NAME': return t('issues.DAY_NAME');
      case 'EMPTY_DAY': return t('issues.EMPTY_DAY');
      case 'LESSON_TITLE': return t('issues.LESSON_TITLE');
      case 'LESSON_CONTENT': return t('issues.LESSON_CONTENT');
      case 'QUESTION_CONTENT': return t('issues.QUESTION_CONTENT');
      case 'OPTION_COUNT': return t('issues.OPTION_COUNT');
      case 'OPTION_EMPTY': return t('issues.OPTION_EMPTY');
      case 'ANSWER_INVALID': return t('issues.ANSWER_INVALID');
      default: return t('builder.fallbackIssue');
    }
  };

  return <section className="v4-template-builder" aria-label={t('builder.label')}>
    {preview && <p className="v4-builder-preview-note" role="note">{t('builder.previewNote')}</p>}
    <div className="v4-builder-title"><div><small>{t(props.positionId ? 'builder.eyebrowEdit' : 'builder.eyebrowCreate')}</small><h1>{t(props.positionId ? 'builder.editTitle' : 'builder.createTitle')}</h1><p>{t('builder.subtitle')}</p></div><span>{t(`status.${props.initialStatus === 'ready' ? 'ready' : props.initialStatus === 'disabled' ? 'disabled' : 'draft'}`)}</span></div>
    <div className="v4-builder-grid">
      <WeekRail weeks={tree.weeks} days={days} selectedWeekId={selectedWeekId} selectedDayId={selectedDayId} onSelectWeek={(id) => { setSelectedWeekId(id); setSelectedDayId(days.find((day) => day.stageId === id)?.id ?? null); }} onSelectDay={setSelectedDayId} onAddWeek={addWeek} onAddDay={addDay} />
      <main className="v4-builder-workspace">
        <section className="v4-builder-intro"><small>{t('builder.positionInfo')}</small><h2>{t('builder.positionQuestion')}</h2><label>{t('builder.positionName')}<input id="v4-builder-position-name" value={name} onChange={(event) => { editRevision.current += 1; nameRef.current = event.target.value; setName(event.target.value); setSaveState('dirty'); if (pendingRef.current.length) void processUploads(event.target.value); }} placeholder={t('builder.positionPlaceholder')} /></label></section>
        {selectedWeek && <section className="v4-builder-week-editor"><label>{t('builder.weekName')}<input id={`v4-builder-${selectedWeek.id}-name`} value={selectedWeek.name} onChange={(event) => editTree({ ...tree, weeks: tree.weeks.map((week) => week.id === selectedWeek.id ? { ...week, name: event.target.value } : week) })} /></label><small>{t('builder.weekHelp')}</small><button type="button" disabled={tree.weeks.length <= 1 || uploading} onClick={() => setDeletingWeekId(selectedWeek.id)}>{t('builder.deleteWeek')}</button></section>}
        {selectedWeek && !selectedDay && <section className="v4-builder-empty"><h2>{t('builder.emptyWeekTitle')}</h2><p>{t('builder.emptyWeekBody')}</p><button type="button" onClick={() => addDay(selectedWeek.id)}>{t('builder.addDay')}</button></section>}
        {selectedDay && <DayEditor day={selectedDay} children={dayChildren} optionsByQuestion={optionsByQuestion} onUpdate={updateItem} onRemove={removeItem} onAddLesson={addLesson} onAddQuestion={addQuestion} onQuestionChange={updateQuestion} ids={props.ids} filesGateway={preview ? undefined : props.filesGateway} positionId={props.positionId} onSelectFile={!preview && createdHere.current ? selectFile : undefined} uploadDisabled={uploading || saving.current} onAttach={attachFile} onUnlink={unlinkFile} />}
      </main>
      <aside className="v4-builder-readiness" aria-label={t('builder.readinessLabel')}><h2>{t('builder.readinessTitle')}</h2><p>{t(preview ? 'builder.readinessPreview' : 'builder.readinessLive')}</p><strong>{issues.length ? t('builder.issueCount', { count: issues.length }) : t('builder.ready')}</strong><ul>{issues.map((issue, index) => <li key={`${issue.code}:${issue.itemId ?? ''}:${index}`}><button type="button" onClick={() => focusIssue(issue)}>{issueLabel(issue.code)}</button></li>)}</ul></aside>
    </div>
    <div className="v4-builder-savebar"><span role="status">{preview ? t('builder.saveState.preview') : t(`builder.saveState.${saveState}`)}</span>{pendingFiles.length > 0 && !name.trim() && <p>{t('builder.pendingFile', { files: pendingFiles.map((entry) => entry.file.name).join(', ') })}</p>}{uploadError && <p role="alert">{pendingFiles[0]?.file.name}: {getErrorMessage(uploadError, errorT)} <button type="button" onClick={() => void processUploads(nameRef.current)}>{t('builder.retryUpload')}</button></p>}{saveError && <p role="alert">{getErrorMessage(saveError, errorT)}</p>}<div><button type="button" disabled={preview || saving.current || pendingFiles.length > 0} onClick={() => void save('draft')}>{t('builder.saveDraft')}</button><button type="button" disabled={preview || saving.current || pendingFiles.length > 0 || issues.length > 0} onClick={() => void save('ready')}>{t('builder.markReady')}</button></div></div>
    {deletingWeekId && <div ref={deleteDialogRef} role="dialog" aria-modal="true" aria-label={t('builder.deleteDialog.label')} className="v4-builder-dialog"><h2>{t('builder.deleteDialog.title')}</h2><p>{t('builder.deleteDialog.body', { count: deletingDays.length })}</p><button ref={deleteKeepRef} type="button" onClick={() => setDeletingWeekId(null)}>{t('builder.deleteDialog.keep')}</button><button type="button" disabled={uploading} onClick={removeWeek}>{t('builder.deleteDialog.confirm')}</button></div>}
  </section>;
}
