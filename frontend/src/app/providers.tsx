import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const init = useAuth((s) => s.init);
  const applyTheme = useTheme((s) => s.apply);

  useEffect(() => {
    applyTheme();
    void init();
  }, [init, applyTheme]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            '!rounded-xl !bg-white !text-navy-900 !shadow-card dark:!bg-surface-dark-2 dark:!text-slate-100',
          duration: 3500,
        }}
      />
    </QueryClientProvider>
  );
}
