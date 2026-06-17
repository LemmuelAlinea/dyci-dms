import { create } from 'zustand';

interface UIState {
  collapsed: boolean;
  mobileOpen: boolean;
  toggleCollapsed: () => void;
  setMobileOpen: (v: boolean) => void;
}

const KEY = 'dyci.sidebarCollapsed';

export const useUI = create<UIState>((set, get) => ({
  collapsed: localStorage.getItem(KEY) === '1',
  mobileOpen: false,
  toggleCollapsed: () => {
    const next = !get().collapsed;
    localStorage.setItem(KEY, next ? '1' : '0');
    set({ collapsed: next });
  },
  setMobileOpen: (v) => set({ mobileOpen: v }),
}));
