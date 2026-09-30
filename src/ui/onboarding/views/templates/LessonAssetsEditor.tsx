import { useState } from 'react';
import type { FileMetadata, FilesGateway } from '../../data/files';
import type { Lesson } from '../../domain/models';
import { AttachmentList } from '../../components/AttachmentList';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../../i18n/error-message';
import type { UiError } from '../../../i18n/ui-error';

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
  const { t } = useTranslation('templates');
  const { t: errorT } = useTranslation('errors');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  async function upload(file: File) {
    if (!gateway || busy || uploadDisabled) return;
    if (onSelectFile) { onSelectFile(lesson.id, file); return; }
    if (!positionId) return;
    setBusy(true);
    setError(null);
    try { onAttach(lesson.id, await gateway.upload(positionId, file)); }
    catch { setError({ code: 'FILE_UPLOAD_FAILED' }); }
    finally { setBusy(false); }
  }
  if (!gateway) return null;
  return <section aria-label={t('assets.region', { name: lesson.name || t('assets.fallbackLesson') })}>
    <h3>{t('assets.title')}</h3>
    {(positionId || onSelectFile)
      ? <label>{t('assets.attach')}<input type="file" disabled={busy || uploadDisabled} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void upload(file);
      }} /></label>
      : null}
    {busy && <span role="status">{t('assets.uploading')}</span>}
    {error && <span role="alert">{getErrorMessage(error, errorT)}</span>}
    <AttachmentList files={lesson.attachments} gateway={gateway} onUnlink={(fileId) => onUnlink(lesson.id, fileId)} />
  </section>;
}
