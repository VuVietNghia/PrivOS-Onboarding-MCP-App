import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileContent, FilesGateway } from '../data/files';
import type { FileRef } from '../domain/models';
import { getErrorMessage } from '../../i18n/error-message';
import { toUiError, type UiError } from '../../i18n/ui-error';
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog';

export interface AttachmentListProps {
  files: readonly FileRef[];
  gateway: FilesGateway;
  onUnlink?: (fileId: string) => void;
}

export function AttachmentList({ files, gateway, onUnlink }: AttachmentListProps) {
  const { t } = useTranslation('learning');
  const { t: errorT } = useTranslation('errors');
  const [accessError, setAccessError] = useState<{ fileId: string; error: UiError } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileContent | null>(null);
  async function access(fileId: string, intent: 'view' | 'download') {
    setBusyId(fileId);
    setAccessError(null);
    try {
      if (intent === 'view') setPreview(await gateway.content(fileId));
      else await gateway.download(fileId);
    }
    catch (cause) {
      const normalized = toUiError(cause);
      const error: UiError = normalized.code === 'NOT_ALLOWED' ? { code: 'FILE_NOT_ALLOWED' }
        : normalized.code === 'UNKNOWN' ? { code: 'FILE_OPEN_FAILED' } : normalized;
      setAccessError({ fileId, error });
    }
    finally { setBusyId(null); }
  }
  if (!files.length) return <p>{t('attachments.empty')}</p>;
  return <><ul className="v4-attachment-list">{files.map((file) => <li key={file.id}>
    <span>{file.name}</span>{file.mimeType && <small> {file.mimeType}</small>}
    <button type="button" disabled={busyId === file.id} onClick={() => void access(file.id, 'view')} aria-label={t('attachments.openLabel', { name: file.name })}>{t('attachments.open')}</button>
    <button type="button" disabled={busyId === file.id} onClick={() => void access(file.id, 'download')} aria-label={t('attachments.downloadLabel', { name: file.name })}>{t('attachments.download')}</button>
    {onUnlink && <button type="button" onClick={() => onUnlink(file.id)} aria-label={t('attachments.unlinkLabel', { name: file.name })}>{t('attachments.unlink')}</button>}
    {accessError?.fileId === file.id && <span role="alert">{getErrorMessage(accessError.error, errorT)}</span>}
  </li>)}</ul>{preview && <AttachmentPreviewDialog content={preview} downloadPending={busyId === preview.fileId}
    downloadError={accessError?.fileId === preview.fileId ? getErrorMessage(accessError.error, errorT) : undefined}
    onDownload={() => void access(preview.fileId, 'download')} onClose={() => { setPreview(null); setAccessError(null); }} />}</>;
}
