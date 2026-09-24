import { useState } from 'react';
import type { FileMetadata, FilesGateway } from '../../data/files';
import type { Lesson } from '../../domain/models';
import { AttachmentList } from '../../components/AttachmentList';

interface LessonAssetsEditorProps {
  lesson: Lesson;
  gateway?: FilesGateway;
  positionId?: string;
  onAttach: (lessonId: string, file: FileMetadata) => void;
  onUnlink: (lessonId: string, fileId: string) => void;
}

export function LessonAssetsEditor({ lesson, gateway, positionId, onAttach, onUnlink }: LessonAssetsEditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function upload(file: File) {
    if (!gateway || !positionId || busy) return;
    setBusy(true);
    setError(false);
    try { onAttach(lesson.id, await gateway.upload(positionId, file)); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  if (!gateway) return null;
  return <section aria-label={`Tài liệu ${lesson.name || 'bài học'}`}>
    <h3>Tài liệu đính kèm</h3>
    {positionId
      ? <label>Đính kèm file<input type="file" disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void upload(file);
      }} /></label>
      : <p>Lưu nháp vị trí trước khi đính kèm file.</p>}
    {busy && <span role="status">Đang tải lên</span>}
    {error && <span role="alert">Không tải được file. Thử lại.</span>}
    <AttachmentList files={lesson.attachments} gateway={gateway} onUnlink={(fileId) => onUnlink(lesson.id, fileId)} />
  </section>;
}
