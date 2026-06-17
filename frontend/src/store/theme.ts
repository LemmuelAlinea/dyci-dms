import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  apply: () => void;
}

const KEY = 'dyci.theme';

function resolve(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem(KEY) as Theme) ?? 'light',
  setTheme: (t) => {
    localStorage.setItem(KEY, t);
    set({ theme: t });
    document.documentElement.classList.toggle('dark', resolve(t) === 'dark');
  },
  apply: () => {
    document.documentElement.classList.toggle('dark', resolve(get().theme) === 'dark');
  },
}));
