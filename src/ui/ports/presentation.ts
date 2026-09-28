export interface ThemeTarget { apply(theme: 'light' | 'dark'): void }
export interface ReloadPage { reload(): void }
export interface FocusTarget { focus(id: string): void }
