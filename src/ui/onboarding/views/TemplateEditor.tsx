import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { createTemplateList, listTemplateLists, loadListWithFields } from '../data/find-lists';
import { createItem, deleteItem, listAllItems, updateItem, type HubList } from '../data/onboarding-lists';
import { F, OWNER_OPTIONS, TEMPLATE_FIELDS, type FieldIds } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';
import { parseTemplateTask, type TemplateTask } from '../domain/schemas';
import { ErrorBanner } from './ErrorBanner';
import { parseStageNames, taskFormSchema, type TaskForm } from './template-form';

const EMPTY_FORM: TaskForm = { name: '', dayOffset: 0, owner: 'Nhân sự', stageId: '' };

function taskFields(ids: FieldIds, form: TaskForm) {
  return [{ fieldId: ids[F.dayOffset], value: form.dayOffset }, { fieldId: ids[F.owner], value: form.owner }];
}

export function TemplateEditor({ onBack }: { onBack: () => void }) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const [templates, setTemplates] = useState<HubList[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [stages, setStages] = useState<StageRef[]>([]);
  const [ids, setIds] = useState<FieldIds>({});
  const [tasks, setTasks] = useState<TemplateTask[]>([]);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [capped, setCapped] = useState(false);
  const [newPosition, setNewPosition] = useState('');
  const [newStages, setNewStages] = useState('Trước ngày đầu\nNgày đầu\nTuần 1\nTháng 1');
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingTaskId, setConfirmingTaskId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const loadSeq = useRef(0);

  const reloadTemplates = useCallback(() => listTemplateLists(app, roomId).then(setTemplates).catch(setError), [app, roomId]);
  useEffect(() => { void reloadTemplates(); }, [reloadTemplates]);

  const loadTemplate = useCallback(async (listId: string) => {
    const seq = ++loadSeq.current;
    if (!listId) { setStages([]); setTasks([]); setCapped(false); return; }
    try {
      const loaded = await loadListWithFields(app, listId, TEMPLATE_FIELDS);
      const { items, capped: itemsCapped } = await listAllItems(app, listId);
      if (loadSeq.current !== seq) return; // một loadTemplate() mới hơn đã khởi chạy, bỏ kết quả cũ này
      const parsed = items.map((i) => parseTemplateTask(i, loaded.ids));
      setStages(loaded.stages); setIds(loaded.ids);
      setTasks(parsed.flatMap((p) => (p.ok ? [p.value] : [])));
      setInvalid(parsed.flatMap((p) => (p.ok ? [] : [p.itemId])));
      setCapped(itemsCapped);
      setForm({ ...EMPTY_FORM, stageId: loaded.stages[0]?._id ?? '' });
      setError(null);
    } catch (err) {
      if (loadSeq.current !== seq) return;
      setError(err);
    }
  }, [app]);

  useEffect(() => { void loadTemplate(selectedId); }, [selectedId, loadTemplate]);

  async function onCreateTemplate(e: FormEvent) {
    e.preventDefault();
    const stageNames = parseStageNames(newStages);
    if (!newPosition.trim() || stageNames.length === 0) { setFormError('Nhập tên vị trí và ít nhất một giai đoạn.'); return; }
    try {
      const list = await createTemplateList(app, roomId, newPosition.trim(), stageNames);
      setNewPosition(''); await reloadTemplates(); setSelectedId(list._id); setFormError(null);
    } catch (err) { setError(err); }
  }

  async function onSaveTask(e: FormEvent) {
    e.preventDefault();
    const parsed = taskFormSchema.safeParse(form);
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ'); return; }
    if (!ids[F.dayOffset] || !ids[F.owner]) { setFormError('Template chưa tải xong, thử lại sau.'); return; }
    try {
      if (editingId) await updateItem(app, { itemId: editingId, name: parsed.data.name, stageId: parsed.data.stageId, customFields: taskFields(ids, parsed.data) });
      else await createItem(app, { listId: selectedId, name: parsed.data.name, stageId: parsed.data.stageId, customFields: taskFields(ids, parsed.data) });
      setEditingId(null); setForm({ ...EMPTY_FORM, stageId: stages[0]?._id ?? '' }); setFormError(null);
      await loadTemplate(selectedId);
    } catch (err) { setError(err); }
  }

  async function onDeleteTask(task: TemplateTask) {
    try { await deleteItem(app, task.id); await loadTemplate(selectedId); } catch (err) { setError(err); }
  }

  return (
    <div>
      <button type="button" className="btn-cancel-edit" onClick={onBack}>Quay lại</button>
      <h2>Template theo vị trí</h2>
      <ErrorBanner error={error} />
      {formError && <div className="error-message">{formError}</div>}

      <form className="add-record-form" onSubmit={onCreateTemplate}>
        <h3>Thêm vị trí</h3>
        <div className="form-group"><label>Tên vị trí <input className="edit-input" value={newPosition} onChange={(e) => setNewPosition(e.target.value)} /></label></div>
        <div className="form-group"><label>Giai đoạn (mỗi dòng một giai đoạn)<br /><textarea className="edit-input" rows={4} value={newStages} onChange={(e) => setNewStages(e.target.value)} /></label></div>
        <div className="form-actions"><button type="submit" className="btn-submit">Tạo template</button></div>
      </form>

      <div className="list-select-row">
        <label>Vị trí{' '}
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">— chọn —</option>
            {templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </label>
      </div>

      {selectedId && (
        <>
          {invalid.length > 0 && <div className="error-message">{invalid.length} task có dữ liệu lỗi: {invalid.join(', ')}</div>}
          {capped && <div className="items-count">Danh sách bị giới hạn 500 task (thiếu quyền lists:query).</div>}
          {stages.map((stage) => (
            <section key={stage._id}>
              <h3>{stage.name}</h3>
              <ul>
                {tasks.filter((t) => t.stageId === stage._id).sort((a, b) => a.dayOffset - b.dayOffset).map((t) => {
                  const confirming = confirmingTaskId === t.id;
                  return (
                    <li key={t.id}>{t.name} · D+{t.dayOffset} · {t.owner}{' '}
                      <button type="button" className="btn-edit" onClick={() => { setEditingId(t.id); setForm({ name: t.name, dayOffset: t.dayOffset, owner: t.owner, stageId: t.stageId }); }}>Sửa</button>{' '}
                      {confirming ? <>
                        <button type="button" className="btn-delete" onClick={() => { void onDeleteTask(t); setConfirmingTaskId(null); }}>Xác nhận xóa?</button>{' '}
                        <button type="button" className="btn-cancel-edit" onClick={() => setConfirmingTaskId(null)}>Thôi</button>
                      </> : (
                        <button type="button" className="btn-delete" onClick={() => setConfirmingTaskId(t.id)}>Xóa</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <form className="add-record-form" onSubmit={onSaveTask}>
            <h3>{editingId ? 'Sửa task' : 'Thêm task'}</h3>
            <div className="form-group"><label>Tên <input className="edit-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label></div>
            <div className="form-group"><label>Hạn (ngày làm việc thứ N) <input type="number" min={0} className="edit-input" value={Number.isNaN(form.dayOffset) ? '' : form.dayOffset} onChange={(e) => setForm({ ...form, dayOffset: e.target.value.trim() === '' ? Number.NaN : Number(e.target.value) })} /></label></div>
            <div className="form-group"><label>Người thực hiện{' '}
              <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value as TaskForm['owner'] })}>
                {OWNER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select></label></div>
            <div className="form-group"><label>Giai đoạn{' '}
              <select value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
                {stages.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select></label></div>
            <div className="form-actions">
              <button type="submit" className="btn-submit" disabled={!ids[F.dayOffset] || !ids[F.owner]}>{editingId ? 'Lưu' : 'Thêm'}</button>
              {editingId && <button type="button" className="btn-cancel-edit" onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM, stageId: stages[0]?._id ?? '' }); }}>Bỏ</button>}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
