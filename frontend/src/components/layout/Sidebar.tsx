import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUI } from '@/store/ui';
import { LogoWordmark, Logo } from '@/components/ui/Logo';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export function Sidebar({ sections, footer }: { sections: NavSection[]; footer?: React.ReactNode }) {
  const { collapsed, mobileOpen, toggleCollapsed, setMobileOpen } = useUI();

  const content = (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center px-4 py-4', collapsed ? 'justify-center' : 'justify-between')}>
        {collapsed ? <Logo size={36} /> : <LogoWordmark />}
        <button
          onClick={toggleCollapsed}
          className={cn(
            'hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-navy-50 hover:text-navy-700 lg:block dark:hover:bg-white/10',
            collapsed && 'absolute right-2 top-5',
          )}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft size={18} className={cn('transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {sections.map((section, i) => (
          <div key={i}>
            {section.title && !collapsed && (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-navy-700 text-white shadow-navy'
                        : 'text-slate-600 hover:bg-navy-50 hover:text-navy-800 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
                    )
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon size={19} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {footer && <div className="border-t border-slate-200/70 p-3 dark:border-white/10">{footer}</div>}
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-r border-slate-200/70 bg-white transition-[width] duration-300 lg:block dark:border-white/10 dark:bg-surface-dark-2',
          collapsed ? 'w-[76px]' : 'w-[260px]',
        )}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <motion.aside
              className="absolute left-0 top-0 h-full w-[270px] bg-white shadow-navy dark:bg-surface-dark-2"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            >
              {content}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
