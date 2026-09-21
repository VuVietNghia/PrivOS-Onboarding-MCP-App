// src/ui/onboarding/domain/concurrency.ts
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  async function worker(): Promise<void> {
    while (next < items.length && !failed) {
      const index = next;
      next += 1;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        // Hub không có transaction: khi một lệnh ghi lỗi, các worker khác
        // KHÔNG được tiếp tục ghi lên Hub trong nền — nếu không, một resume
        // ngay sau đó có thể chụp snapshot trước khi các ghi đó tới nơi và
        // tạo trùng. Dừng sớm, giữ nguyên hành vi reject của Promise.all.
        failed = true;
        throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
