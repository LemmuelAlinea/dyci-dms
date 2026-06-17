import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Mail, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { Spinner } from '@/components/ui/Spinner';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'request' | 'update'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    // When the user arrives from the reset email, Supabase emits PASSWORD_RECOVERY.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('update');
    });
    if (window.location.hash.includes('type=recovery')) setMode('update');
    return () => data.subscription.unsubscribe();
  }, []);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error('Password must be at least 8 characters.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success('Password updated. Please sign in.');
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (mode === 'update') {
    return (
      <AuthLayout title="Set a new password" subtitle="Choose a strong password for your account.">
        <form onSubmit={updatePassword} className="space-y-4">
          <div>
            <label className="label">New password</label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-9"
                placeholder="At least 8 characters"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Spinner className="h-4 w-4" /> : 'Update password'}
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle="We sent you a reset link.">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gold-sheen text-navy-900">
            <MailCheck size={30} />
          </div>
          <p className="text-sm text-slate-500">
            If an account exists for <strong className="text-navy-700 dark:text-gold-200">{email}</strong>, a password
            reset link is on its way.
          </p>
          <Link to="/login" className="btn-primary mt-2 w-full">
            Back to sign in
          </Link>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we'll send a reset link.">
      <form onSubmit={requestReset} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-9" placeholder="you@dyci.edu.ph" />
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? <Spinner className="h-4 w-4" /> : 'Send reset link'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-navy-700 hover:underline dark:text-gold-300">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
