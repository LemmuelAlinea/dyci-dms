import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { FullPageLoader } from '@/components/ui/Spinner';

/** Lands here after Google OAuth or email confirmation. Routes the user onward. */
export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let done = false;
    const route = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      done = true;
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_system_admin')
        .eq('id', data.session.user.id)
        .maybeSingle();
      navigate(profile?.is_system_admin ? '/admin' : '/app', { replace: true });
    };

    void route();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (!done) void route();
    });
    const fallback = setTimeout(() => navigate('/login', { replace: true }), 6000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(fallback);
    };
  }, [navigate]);

  return <FullPageLoader />;
}
