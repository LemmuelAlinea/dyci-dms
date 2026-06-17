import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-hero-navy lg:block">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_20%,#3e50c8_0,transparent_45%),radial-gradient(circle_at_80%_70%,#eab02e55_0,transparent_40%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-3">
            <Logo size={48} />
            <div>
              <p className="font-display text-lg font-extrabold">DYCI · DMS</p>
              <p className="text-xs text-navy-200">Dr. Yanga's Colleges, Inc.</p>
            </div>
          </Link>

          <div>
            <motion.img
              src="/assets/icon-folder-gold.png"
              alt=""
              className="mb-8 h-28 w-28 animate-float object-contain drop-shadow-2xl"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
            />
            <h2 className="max-w-md font-display text-4xl font-extrabold leading-tight">
              Document workflows for every office.
            </h2>
            <p className="mt-4 max-w-md text-navy-200">
              Upload, approve, release, and share official papers securely — built for the offices of Dr. Yanga's
              Colleges.
            </p>
          </div>

          <p className="text-xs text-navy-300">© {new Date().getFullYear()} Dr. Yanga's Colleges, Inc. · Bocaue, Bulacan</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-surface-light-2 px-5 py-10 dark:bg-surface-dark">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={44} />
            <div>
              <p className="font-display text-lg font-extrabold text-navy-900 dark:text-white">DYCI · DMS</p>
              <p className="text-xs text-slate-400">Document Management System</p>
            </div>
          </div>
          <h1 className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

export function GoogleButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} className="btn-outline w-full">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
        />
      </svg>
      Continue with Google
    </button>
  );
}
