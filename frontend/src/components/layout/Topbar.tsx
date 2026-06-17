import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, LogOut, Menu, Moon, Search, Settings, Sun, Building2 } from 'lucide-react';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationsBell } from './NotificationsBell';
import { ROLE_LABEL } from '@/lib/types';

export function Topbar({ showSearch = true }: { showSearch?: boolean }) {
  const navigate = useNavigate();
  const setMobileOpen = useUI((s) => s.setMobileOpen);
  const { profile, memberships, currentOrgId, setCurrentOrg, signOut, role } = useAuth();
  const { theme, setTheme } = useTheme();
  const [orgOpen, setOrgOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [term, setTerm] = useState('');
  const orgRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentOrg = memberships.find((m) => m.org_id === currentOrgId)?.organizations;
  const currentRole = role();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur-md dark:border-white/10 dark:bg-surface-dark-2/85">
      <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-white/10">
        <Menu size={20} />
      </button>

      {/* Org switcher */}
      {memberships.length > 0 && (
        <div className="relative" ref={orgRef}>
          <button
            onClick={() => setOrgOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy-800 transition hover:bg-slate-50 dark:border-white/10 dark:bg-surface-dark-3 dark:text-white dark:hover:bg-white/5"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gold-sheen text-[11px] font-extrabold text-navy-900">
              {currentOrg?.code?.slice(0, 3) ?? '·'}
            </span>
            <span className="hidden max-w-[160px] truncate sm:inline">{currentOrg?.name ?? 'Select office'}</span>
            <ChevronDown size={15} className="text-slate-400" />
          </button>
          <AnimatePresence>
            {orgOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-navy dark:border-white/10 dark:bg-surface-dark-2"
              >
                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Your offices</p>
                {memberships.map((m) => (
                  <button
                    key={m.org_id}
                    onClick={() => {
                      setCurrentOrg(m.org_id);
                      setOrgOpen(false);
                      navigate('/app/drive');
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-navy-50 dark:hover:bg-white/5 ${
                      m.org_id === currentOrgId ? 'bg-navy-50 dark:bg-white/5' : ''
                    }`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-navy-700 text-[10px] font-bold text-white">
                      {m.organizations?.code?.slice(0, 3)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-navy-900 dark:text-white">{m.organizations?.name}</span>
                      <span className="text-[11px] text-slate-400">{ROLE_LABEL[m.role]}</span>
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Search */}
      {showSearch && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (term.trim()) navigate(`/app/search?q=${encodeURIComponent(term.trim())}`);
          }}
          className="ml-1 hidden flex-1 items-center md:flex"
        >
          <div className="relative w-full max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search files, folders, released papers…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-navy-400 focus:bg-white dark:border-white/10 dark:bg-surface-dark-3 dark:text-white"
            />
          </div>
        </form>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <NotificationsBell />

        {/* Profile menu */}
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 transition hover:bg-slate-100 dark:hover:bg-white/10">
            <Avatar name={profile?.full_name} url={profile?.avatar_url} size={32} />
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-semibold leading-tight text-navy-900 dark:text-white">
                {profile?.full_name ?? 'User'}
              </span>
              <span className="block text-[10px] leading-tight text-slate-400">
                {currentRole ? ROLE_LABEL[currentRole] : profile?.is_system_admin ? 'System Admin' : ''}
              </span>
            </span>
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-navy dark:border-white/10 dark:bg-surface-dark-2"
              >
                <div className="border-b border-slate-100 px-3 py-2 dark:border-white/10">
                  <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{profile?.full_name}</p>
                  <p className="truncate text-xs text-slate-400">{profile?.email}</p>
                </div>
                {!profile?.is_system_admin && (
                  <button
                    onClick={() => {
                      navigate('/app/settings');
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-navy-50 dark:text-slate-200 dark:hover:bg-white/5"
                  >
                    <Settings size={16} /> Settings
                  </button>
                )}
                {profile?.is_system_admin && (
                  <button
                    onClick={() => {
                      navigate('/admin');
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-navy-50 dark:text-slate-200 dark:hover:bg-white/5"
                  >
                    <Building2 size={16} /> Admin Console
                  </button>
                )}
                <button
                  onClick={() => signOut()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-500/10"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
