declare function t(key: string): string;
declare function setError(message: string): void;

export function Fixture({ authored }: { authored: string }) {
  const status = 'learning';
  return <><p>Đang tải</p><button aria-label="Reload">{t('common:retry')}</button>
    <div className="card" data-status={status}><a href="https://privos.ai">{authored}</a></div>
    {status === 'learning' ? 'Tiếp tục' : authored}</>;
}

export function fail(): void {
  setError('Có lỗi');
}
