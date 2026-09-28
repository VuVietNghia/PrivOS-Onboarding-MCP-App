export interface Clock { now(): Date }
export interface IdGenerator { next(): string }
export interface Hasher { sha256(text: string): Promise<string> }
export interface Scheduler { after(ms: number, task: () => void): () => void }
export interface Preferences {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}
export interface ExternalLinks {
  open(resolve: () => Promise<{ url: string; name: string }>, intent: 'view' | 'download'): Promise<void>;
}
export interface KeyedLock { run<T>(key: string, operation: () => Promise<T>): Promise<T> }
export interface Lifetime { assertActive(): void; dispose(): void }
export interface Logger {
  event(name: string, fields: Readonly<Record<string, string | number | boolean>>): void;
}
