import { useState } from 'react';
import type { FilesGateway } from '../data/files';
import type { FileRef } from '../domain/models';
import { describeError } from '../domain/errors';
import type { OnboardingLocale } from '../views/OnboardingShell';
import { learningCopy } from '../views/learning/learning-copy';

export interface AttachmentListProps {
  files: readonly FileRef[];
  gateway: FilesGateway;
  onUnlink?: (fileId: string) => void;
  locale?: OnboardingLocale;
}

export function AttachmentList({ files, gateway, onUnlink, locale = 'vi' }: AttachmentListProps) {
  const t = learningCopy(locale);
  const [accessError, setAccessError] = useState<{ fileId: string; denied: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function access(fileId: string, intent: 'view' | 'download') {
    setBusyId(fileId);
    setAccessError(null);
    try { await gateway.open(fileId, intent); }
    catch (cause) { setAccessError({ fileId, denied: describeError(cause).code === 'NOT_ALLOWED' }); }
    finally { setBusyId(null); }
  }
  if (!files.length) return <p>{t.noAttachments}</p>;
  return <ul className="v4-attachment-list">{files.map((file) => <li key={file.id}>
    <span>{file.name}</span>{file.mimeType && <small> {file.mimeType}</small>}
    <button type="button" disabled={busyId === file.id} onClick={() => void access(file.id, 'view')} aria-label={`${t.openFile} ${file.name}`}>{t.openFile}</button>
    <button type="button" disabled={busyId === file.id} onClick={() => void access(file.id, 'download')} aria-label={`${t.downloadFile} ${file.name}`}>{t.downloadFile}</button>
    {onUnlink && <button type="button" onClick={() => onUnlink(file.id)} aria-label={`${t.unlinkFile} ${file.name}`}>{t.unlinkFile}</button>}
    {accessError?.fileId === file.id && <span role="alert">{accessError.denied ? t.fileNotAllowed : t.fileFailed}</span>}
  </li>)}</ul>;
}
