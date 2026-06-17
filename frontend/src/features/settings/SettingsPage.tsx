import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Camera, Lock, Moon, Palette, Sun, User } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme';

const NOTIF_FIELDS: { key: string; label: string; desc: string }[] = [
  { key: 'approvals', label: 'Approval requests & decisions', desc: 'When someone requests your approval or decides on yours.' },
  { key: 'shares', label: 'Shared files', desc: 'When a colleague shares a file with you.' },
  { key: 'releases', label: 'Released papers', desc: 'When a new paper is released in your office.' },
  { key: 'messages', label: 'Messages', desc: 'When you receive a direct message.' },
];

export function SettingsPage() {
  const { profile, refresh, session } = useAuth();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(profile?.notif_prefs ?? {});
  const [password, setPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', profile!.id);
      await refresh();
      toast.success('Profile saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !session) return;
    const ext = f.name.split('.').pop();
    const path = `${session.user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, f, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: `${data.publicUrl}?t=${Date.now()}` }).eq('id', session.user.id);
    await refresh();
    toast.success('Photo updated');
  };

  const togglePref = async (key: string) => {
    const next = { ...prefs, [key]: !(prefs[key] ?? true) };
    setPrefs(next);
    await supabase.from('profiles').update({ notif_prefs: next }).eq('id', profile!.id);
    await refresh();
  };

  const changePassword = async () => {
    if (password.length < 8) return toast.error('Password must be at least 8 characters.');
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated');
      setPassword('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPw(false);
    }
  };

  const sendResetEmail = async () => {
    if (!profile?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, { redirectTo: `${window.location.origin}/reset` });
    if (error) return toast.error(error.message);
    toast.success('Reset link sent to your email');
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your profile, appearance, notifications and security." icon={<User size={22} />} />

      <div className="space-y-6">
        {/* Profile */}
        <section className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-navy-900 dark:text-white"><User size={18} /> Profile</h3>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative w-fit">
              <Avatar name={profile?.full_name} url={profile?.avatar_url} size={72} />
              <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-navy-700 text-white shadow-navy transition hover:bg-navy-600">
                <Camera size={15} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="label">Full name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input max-w-md" />
              </div>
              <div>
                <label className="label">Email</label>
                <input value={profile?.email ?? ''} readOnly className="input max-w-md opacity-60" />
              </div>
              <button onClick={saveProfile} disabled={savingProfile} className="btn-primary">
                {savingProfile ? <Spinner className="h-4 w-4" /> : 'Save changes'}
              </button>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-navy-900 dark:text-white"><Palette size={18} /> Appearance</h3>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {([
              { key: 'light', label: 'Light', icon: Sun },
              { key: 'dark', label: 'Dark', icon: Moon },
              { key: 'system', label: 'System', icon: Palette },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setTheme(opt.key)}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-sm font-medium transition ${
                  theme === opt.key ? 'border-navy-600 bg-navy-50 text-navy-700 dark:border-gold-400 dark:bg-white/5 dark:text-gold-200' : 'border-slate-200 text-slate-500 dark:border-white/10'
                }`}
              >
                <opt.icon size={20} /> {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Notifications */}
        <section className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-navy-900 dark:text-white"><Bell size={18} /> Notifications</h3>
          <div className="space-y-1">
            {NOTIF_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4 rounded-xl px-2 py-2.5">
                <div>
                  <p className="text-sm font-medium text-navy-900 dark:text-white">{f.label}</p>
                  <p className="text-xs text-slate-400">{f.desc}</p>
                </div>
                <button
                  onClick={() => togglePref(f.key)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${prefs[f.key] ?? true ? 'bg-navy-700' : 'bg-slate-300 dark:bg-white/15'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs[f.key] ?? true ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Security */}
        <section className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-navy-900 dark:text-white"><Lock size={18} /> Security</h3>
          <div className="max-w-md space-y-3">
            <div>
              <label className="label">New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="At least 8 characters" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={changePassword} disabled={savingPw} className="btn-primary">
                {savingPw ? <Spinner className="h-4 w-4" /> : 'Update password'}
              </button>
              <button onClick={sendResetEmail} className="btn-outline">Email me a reset link</button>
            </div>
            <p className="text-[11px] text-slate-400">Password changes are confirmed via your email for security.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
