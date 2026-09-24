import { useState } from 'react';
import type { FilesGateway } from '../data/files';
import type { FileRef } from '../domain/models';

export interface AttachmentListProps {
  files: readonly FileRef[];
  gateway: FilesGateway;
  onUnlink?: (fileId: string) => void;
}

export function AttachmentList({ files, gateway, onUnlink }: AttachmentListProps) {
  const [errorId, setErrorId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function access(fileId: string, intent: 'view' | 'download') {
    setBusyId(fileId);
    setErrorId(null);
    try { await gateway.open(fileId, intent); }
    catch { setErrorId(fileId); }
    finally { setBusyId(null); }
  }
  if (!files.length) return <p>Chưa có file đính kèm.</p>;
  return <ul className="v4-attachment-list">{files.map((file) => <li key={file.id}>
    <span>{file.name}</span>{file.mimeType && <small> {file.mimeType}</small>}
    <button type="button" disabled={busyId === file.id} onClick={() => void access(file.id, 'view')} aria-label={`Mở ${file.name}`}>Mở</button>
    <button type="button" disabled={busyId === file.id} onClick={() => void access(file.id, 'download')} aria-label={`Tải xuống ${file.name}`}>Tải xuống</button>
    {onUnlink && <button type="button" onClick={() => onUnlink(file.id)} aria-label={`Bỏ liên kết ${file.name}`}>Bỏ liên kết</button>}
    {errorId === file.id && <span role="alert">Không mở được file. Thử lại.</span>}
  </li>)}</ul>;
}
