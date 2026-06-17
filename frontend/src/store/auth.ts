import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { OrgMembership, OrgRole, Profile } from '@/lib/types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  memberships: OrgMembership[];
  currentOrgId: string | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setCurrentOrg: (orgId: string) => void;
  signOut: () => Promise<void>;
  currentMembership: () => OrgMembership | null;
  role: () => OrgRole | null;
}

const ORG_KEY = 'dyci.currentOrg';

async function fetchProfileAndMemberships(userId: string) {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ]);
  return { profile: (profile as Profile) ?? null, memberships: (memberships as OrgMembership[]) ?? [] };
}

export const useAuth = create<AuthState>((set, get) => ({
  loading: true,
  session: null,
  profile: null,
  memberships: [],
  currentOrgId: localStorage.getItem(ORG_KEY),

  init: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { profile, memberships } = await fetchProfileAndMemberships(data.session.user.id);
      const stored = localStorage.getItem(ORG_KEY);
      const validStored = memberships.find((m) => m.org_id === stored)?.org_id;
      set({
        session: data.session,
        profile,
        memberships,
        currentOrgId: validStored ?? memberships[0]?.org_id ?? null,
        loading: false,
      });
    } else {
      set({ loading: false });
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const { profile, memberships } = await fetchProfileAndMemberships(session.user.id);
        const stored = localStorage.getItem(ORG_KEY);
        const validStored = memberships.find((m) => m.org_id === stored)?.org_id;
        set({
          session,
          profile,
          memberships,
          currentOrgId: validStored ?? memberships[0]?.org_id ?? null,
          loading: false,
        });
      } else {
        set({ session: null, profile: null, memberships: [], currentOrgId: null, loading: false });
      }
    });
  },

  refresh: async () => {
    const session = get().session;
    if (!session) return;
    const { profile, memberships } = await fetchProfileAndMemberships(session.user.id);
    set({ profile, memberships });
  },

  setCurrentOrg: (orgId) => {
    localStorage.setItem(ORG_KEY, orgId);
    set({ currentOrgId: orgId });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(ORG_KEY);
    set({ session: null, profile: null, memberships: [], currentOrgId: null });
  },

  currentMembership: () => {
    const { memberships, currentOrgId } = get();
    return memberships.find((m) => m.org_id === currentOrgId) ?? null;
  },

  role: () => get().currentMembership()?.role ?? null,
}));
