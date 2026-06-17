import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail, User, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { AuthLayout, GoogleButton } from './AuthLayout';
import { Spinner } from '@/components/ui/Spinner';

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invitedEmail = params.get('email') ?? '';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error('Password must be at least 8 characters.');
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  };

  const google = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  if (sent) {
    return (
      <AuthLayout title="Confirm your email" subtitle="One more step to activate your account.">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card flex flex-col items-center gap-3 p-8 text-center"
        >
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gold-sheen text-navy-900">
            <MailCheck size={30} />
          </div>
          <h3 className="font-display text-lg font-bold text-navy-900 dark:text-white">Check your inbox</h3>
          <p className="text-sm text-slate-500">
            We sent a confirmation link to <strong className="text-navy-700 dark:text-gold-200">{email}</strong>. Click
            it to verify your account, then sign in.
          </p>
          <button onClick={() => navigate('/login')} className="btn-primary mt-2 w-full">
            Go to sign in
          </button>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={invitedEmail ? 'You were invited — finish setting up your account.' : 'Join your office on DYCI DMS.'}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <div className="relative">
            <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input pl-9" placeholder="Juan Dela Cruz" />
          </div>
        </div>
        <div>
          <label className="label">Email</label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={Boolean(invitedEmail)}
              className="input pl-9"
              placeholder="you@dyci.edu.ph"
            />
          </div>
          {invitedEmail && <p className="mt-1 text-[11px] text-slate-400">Use the email your invitation was sent to.</p>}
        </div>
        <div>
          <label className="label">Password</label>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={show ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pl-9 pr-10"
              placeholder="At least 8 characters"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? <Spinner className="h-4 w-4" /> : 'Create account'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
        OR
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
      </div>
      <GoogleButton onClick={google} />

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-navy-700 hover:underline dark:text-gold-300">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
