import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(url && anon);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example → .env — the public landing page still works.');
}

// Fall back to harmless placeholders so the app (e.g. the landing page) can render
// before the project is configured. Real auth/data calls require valid values.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
