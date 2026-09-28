import { useState } from 'react';
import type { FileMetadata, FilesGateway } from '../../data/files';
import type { Lesson } from '../../domain/models';
import { AttachmentList } from '../../components/AttachmentList';

interface LessonAssetsEditorProps {
  lesson: Lesson;
  gateway?: FilesGateway;
  positionId?: string;
  onSelectFile?: (lessonId: string, file: File) => void;
  uploadDisabled?: boolean;
  onAttach: (lessonId: string, file: FileMetadata) => void;
  onUnlink: (lessonId: string, fileId: string) => void;
}

export function LessonAssetsEditor({ lesson, gateway, positionId, onSelectFile, uploadDisabled, onAttach, onUnlink }: LessonAssetsEditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function upload(file: File) {
    if (!gateway || busy || uploadDisabled) return;
    if (onSelectFile) { onSelectFile(lesson.id, file); return; }
    if (!positionId) return;
    setBusy(true);
    setError(false);
    try { onAttach(lesson.id, await gateway.upload(positionId, file)); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  if (!gateway) return null;
  return <section aria-label={`Tài liệu ${lesson.name || 'bài học'}`}>
    <h3>Tài liệu đính kèm</h3>
    {(positionId || onSelectFile)
      ? <label>Đính kèm file<input type="file" disabled={busy || uploadDisabled} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void upload(file);
      }} /></label>
      : null}
    {busy && <span role="status">Đang tải lên</span>}
    {error && <span role="alert">Không tải được file. Thử lại.</span>}
    <AttachmentList files={lesson.attachments} gateway={gateway} onUnlink={(fileId) => onUnlink(lesson.id, fileId)} />
  </section>;
}
