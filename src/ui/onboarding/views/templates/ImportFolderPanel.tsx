import { useState } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import type { RoomBinding } from '../../domain/models';
import { isRoomAdmin } from '../../domain/roles';
import { importBrowserFilesV4, importBrowserFolderV4, type BrowserImportFile } from '../../flows/browser-import-v4';
import './ImportFolderPanel.css';

export interface ImportFolderPanelProps {
  app: McpApp;
  binding: RoomBinding;
  roomId: string;
  userRoles: readonly string[];
  onDone: () => void;
}

interface PositionSummary {
  sourceKey: string;
  name: string;
  weeks: number;
  days: number;
  lessons: number;
  questions: number;
  missingAnswers: number;
  result: 'pending' | 'created' | 'existing';
}

type Phase = 'idle' | 'checking' | 'ready' | 'importing' | 'done' | 'preflight-error' | 'import-error';

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (/^[^\r\n<>]+\.md:\d+(?:\s|$)/u.test(error.message)) return `Lỗi định dạng: ${error.message}`;
    const known: Record<string, string> = {
      SOURCE_PATH_INVALID: 'Đường dẫn trong thư mục nguồn không hợp lệ.',
      SOURCE_PATH_CONFLICT: 'Thư mục có đường dẫn trùng hoặc nhiều thư mục gốc.',
      SOURCE_EMPTY: 'Thư mục chưa có tệp Markdown.',
      SOURCE_NO_POSITIONS: 'Thư mục chưa có nhánh vị trí.',
      IMPORT_SOURCE_CHANGED: 'Nguồn đã đổi sau lần nhập trước. Dừng nhập để tránh ghi nhầm template.',
      IMPORT_SOURCE_CONFLICT: 'Có nhiều vị trí cùng khóa nguồn nhập. Dừng nhập để kiểm tra.',
      IMPORT_ORPHAN_CONFLICT: 'Template nhập dở không khớp nguồn hiện tại. Dừng nhập để kiểm tra.',
      ROOM_MISMATCH: 'Room đang mở không khớp room đích.',
      NOT_ADMIN: 'Chỉ owner hoặc admin của room được nhập template.',
    };
    if (known[error.message]) return known[error.message];
    if (/duplicate Day_\d+/iu.test(error.message)) return `Ngày bị trùng trong nguồn: ${error.message}`;
  }
  return 'Không nhập được tài liệu. Kiểm tra nguồn và thử lại.';
}

export function ImportFolderPanel({ app, binding, roomId, userRoles, onDone }: ImportFolderPanelProps) {
  const [files, setFiles] = useState<BrowserImportFile[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [processed, setProcessed] = useState(0);
  const [error, setError] = useState('');
  const busy = phase === 'checking' || phase === 'importing';
  const canImport = isRoomAdmin(userRoles) && roomId === binding.roomId;

  const checkSource = async () => {
    if (!files.length || busy) return;
    setPhase('checking');
    setPositions([]);
    setProcessed(0);
    setError('');
    try {
      const summaries: PositionSummary[] = [];
      for await (const result of importBrowserFilesV4(files, { dryRun: true })) {
        if (result.state !== 'dry-run') continue;
        const { position, counts, missingAnswers } = result.preflight;
        summaries.push({ sourceKey: position.sourceKey, name: position.name,
          weeks: counts.weeks, days: counts.days, lessons: counts.lessons,
          questions: counts.questions, missingAnswers: missingAnswers.length, result: 'pending' });
        setPositions([...summaries]);
      }
      setPhase('ready');
    } catch (cause) {
      setPositions([]);
      setError(errorMessage(cause));
      setPhase('preflight-error');
    }
  };

  const confirmImport = async () => {
    if (!files.length || !positions.length || !canImport || busy ||
      (phase !== 'ready' && phase !== 'import-error')) return;
    setPhase('importing');
    setError('');
    let completed = 0;
    try {
      for await (const result of importBrowserFolderV4(app, binding, roomId, userRoles, files)) {
        if (result.state === 'dry-run') continue;
        completed += 1;
        setProcessed(completed);
        setPositions((current) => current.map((position) => position.sourceKey === result.preflight.position.sourceKey
          ? { ...position, result: result.state } : position));
      }
      setPhase('done');
      onDone();
    } catch (cause) {
      setError(errorMessage(cause));
      setPhase('import-error');
    }
  };

  return <section className="v4-import-panel" aria-labelledby="v4-import-title">
    <header className="v4-import-heading">
      <div><p className="v4-eyebrow">Nguồn Markdown</p><h2 id="v4-import-title">Nhập template theo vị trí</h2></div>
      <span className="v4-import-step">01 / 02</span>
    </header>
    <p className="v4-import-intro">Chọn thư mục onboarding. Bản kiểm tra hiển thị số tuần, ngày, bài và câu hỏi trước khi ghi template nháp vào room.</p>
    <div className="v4-import-picker">
      <label htmlFor="v4-import-folder">Thư mục Markdown</label>
      <input id="v4-import-folder" type="file" multiple disabled={busy}
        ref={(element) => { element?.setAttribute('webkitdirectory', ''); }}
        onChange={(event) => { setFiles(Array.from(event.currentTarget.files ?? [])); setPhase('idle'); setPositions([]); setProcessed(0); setError(''); }} />
      <small>{files.length ? `${files.length} tệp đã chọn` : 'Chọn thư mục chứa các nhánh vị trí và phần chung.'}</small>
    </div>
    <div className="v4-import-actions">
      <button type="button" className="v4-secondary-button" disabled={!files.length || busy} onClick={() => void checkSource()}>
        {phase === 'checking' ? 'Đang kiểm tra…' : 'Kiểm tra nguồn'}
      </button>
      <button type="button" className="v4-primary-button" disabled={!canImport || !positions.length || busy || (phase !== 'ready' && phase !== 'import-error')}
        onClick={() => void confirmImport()}>
        {phase === 'importing' ? 'Đang nhập…' : phase === 'import-error' ? 'Thử nhập lại' : `Xác nhận nhập ${positions.length} vị trí`}
      </button>
    </div>
    {!canImport && <p className="v4-import-note">Chỉ owner hoặc admin của room hiện tại được nhập template. Bạn vẫn xem được bản kiểm tra nguồn.</p>}
    {error && <p className="v4-import-error" role="alert">{error}</p>}
    {phase === 'checking' && <p role="status">Đang đọc và kiểm tra Markdown…</p>}
    {phase === 'importing' && <p role="status">Đang nhập vị trí {Math.min(processed + 1, positions.length)}/{positions.length}. Đã xử lý {processed} vị trí.</p>}
    {phase === 'done' && <p role="status">Hoàn tất: {processed} vị trí. Template được giữ ở trạng thái nháp.</p>}
    {phase === 'import-error' && <p role="status">Đã xử lý {processed}/{positions.length} vị trí. Chạy lại sẽ kiểm tra khóa nguồn trước khi ghi tiếp.</p>}
    {!!positions.length && <div className="v4-import-report">
      <h3>Bản kiểm tra nguồn</h3>
      <ol>{positions.map((position) => <li key={position.sourceKey}>
        <div className="v4-import-position-head"><strong>{position.name}</strong><span>{position.result === 'created' ? 'Đã nhập' : position.result === 'existing' ? 'Đã có' : 'Nháp'}</span></div>
        <p>{position.weeks} tuần · {position.days} ngày · {position.lessons} bài · {position.questions} câu hỏi</p>
        {position.missingAnswers > 0 && <small>{position.missingAnswers} câu chưa có đáp án; template giữ nháp.</small>}
      </li>)}</ol>
    </div>}
  </section>;
}
