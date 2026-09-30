import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { FileContent } from '../ports/files';
import { useDialogFocus } from '../views/use-dialog-focus';

type PreviewKind = 'markdown' | 'text' | 'image' | 'pdf' | 'unsupported';

function previewKind(content: FileContent): PreviewKind {
  const mime = content.mimeType.toLowerCase();
  if (mime === 'text/markdown' || /\.(md|markdown)$/i.test(content.name)) return 'markdown';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'unsupported';
}

export interface AttachmentPreviewDialogProps {
  content: FileContent;
  downloadPending: boolean;
  downloadError?: string;
  onDownload: () => void;
  onClose: () => void;
}

export function AttachmentPreviewDialog({ content, downloadPending, downloadError, onDownload, onClose }: AttachmentPreviewDialogProps) {
  const { t } = useTranslation('learning');
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const kind = previewKind(content);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useDialogFocus({ open: true, onClose, containerRef: dialogRef, initialFocusRef: closeRef });

  useEffect(() => {
    if (kind !== 'image' && kind !== 'pdf') {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(content.blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content, kind]);

  const titleId = `attachment-preview-${content.fileId}`;
  const preview = (() => {
    switch (kind) {
      case 'markdown':
        return content.text === null ? <p role="alert">{t('attachments.previewFailed')}</p>
          : <div className="v4-markdown v4-attachment-preview-markdown"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content.text}</ReactMarkdown></div>;
      case 'text':
        return content.text === null ? <p role="alert">{t('attachments.previewFailed')}</p>
          : <pre className="v4-attachment-preview-text">{content.text}</pre>;
      case 'image':
        return objectUrl ? <img className="v4-attachment-preview-image" src={objectUrl} alt={content.name} />
          : <p role="status">{t('attachments.previewLoading')}</p>;
      case 'pdf':
        return objectUrl ? <iframe className="v4-attachment-preview-frame" src={objectUrl} title={content.name} />
          : <p role="status">{t('attachments.previewLoading')}</p>;
      case 'unsupported':
        return <p>{t('attachments.previewUnavailable')}</p>;
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  })();

  return <div className="v4-attachment-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="v4-attachment-preview" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header>
        <div><small>{t('attachments.previewEyebrow')}</small><h2 id={titleId}>{t('attachments.previewTitle', { name: content.name })}</h2></div>
        <button ref={closeRef} type="button" className="v4-secondary-button" onClick={onClose}
          aria-label={t('attachments.closePreview')}>{t('attachments.close')}</button>
      </header>
      <div className="v4-attachment-preview-body">{preview}</div>
      <footer>
        {downloadError && <p role="alert">{downloadError}</p>}
        <button type="button" className="v4-primary-button" disabled={downloadPending} onClick={onDownload}>
          {downloadPending ? t('attachments.downloading') : t('attachments.download')}
        </button>
      </footer>
    </section>
  </div>;
}
