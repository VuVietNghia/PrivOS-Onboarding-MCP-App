import type { McpApp } from '@privos_ai/app-react';
import type {
  Clock, ExternalLinks, Hasher, IdGenerator, Logger, Preferences, Scheduler,
} from '../../shared/ports/effects';
import type { FocusTarget, ReloadPage, ThemeTarget } from '../ports/presentation';

export function browserLocale(): 'en' | 'vi' {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'vi';
}

export function createBrowserPresentation(): { reloadPage: ReloadPage; themeTarget: ThemeTarget; logger: Logger } {
  return {
    reloadPage: { reload: () => window.location.reload() },
    themeTarget: { apply: (theme) => document.documentElement.setAttribute('data-theme', theme) },
    logger: { event: (name, fields) => console.info(`[app] ${name}`, fields) },
  };
}

export function createBrowserThemePreferences(): Preferences {
  return {
    async get(key) { return window.localStorage.getItem(key); },
    async set(key, value) { window.localStorage.setItem(key, preferenceText(value)); },
  };
}

export function createBrowserEffects(): {
  clock: Clock; ids: IdGenerator; hasher: Hasher; scheduler: Scheduler; links: ExternalLinks; focus: FocusTarget;
} {
  const clock: Clock = { now: () => new Date() };
  const ids: IdGenerator = { next: () => crypto.randomUUID() };
  const hasher: Hasher = {
    async sha256(value) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    },
  };
  const scheduler: Scheduler = {
    after(ms, task) {
      const timer = setTimeout(task, ms);
      return () => clearTimeout(timer);
    },
  };
  const links: ExternalLinks = {
    async open(resolve, intent) {
      const tab = intent === 'view' ? window.open('', '_blank') : null;
      try {
        const target = await resolve();
        const url = new URL(target.url);
        if (url.protocol !== 'https:') throw new Error('FILE_UNAVAILABLE');
        if (intent === 'view') {
          if (!tab) throw new Error('FILE_UNAVAILABLE');
          tab.location.href = url.href;
        } else {
          const anchor = document.createElement('a');
          anchor.href = url.href;
          anchor.download = target.name;
          anchor.rel = 'noopener noreferrer';
          anchor.click();
        }
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
    save(blob, name) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      scheduler.after(0, () => URL.revokeObjectURL(url));
    },
  };
  return { clock, ids, hasher, scheduler, links,
    focus: { focus: (id) => document.getElementById(id)?.focus() } };
}

function preferenceKey(namespace: string, key: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

function preferenceText(value: unknown): string {
  if (typeof value === 'string') return value;
  const encoded = JSON.stringify(value);
  if (typeof encoded !== 'string') throw new Error('PREFERENCE_VALUE_INVALID');
  return encoded;
}

export function createLocalPreferences(storage: Storage, namespace: string): Preferences {
  return {
    async get(key) { return storage.getItem(preferenceKey(namespace, key)); },
    async set(key, value) { storage.setItem(preferenceKey(namespace, key), preferenceText(value)); },
  };
}

export function createPrivosPreferences(app: McpApp, namespace: string): Preferences {
  return {
    get(key) { return app.storage.get(preferenceKey(namespace, key)); },
    set(key, value) { return app.storage.set(preferenceKey(namespace, key), preferenceText(value)); },
  };
}
