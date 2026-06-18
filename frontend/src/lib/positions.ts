import { supabase } from './supabase';
import type { Profile } from './types';

export interface Position {
  id: string;
  org_id: string;
  name: string;
  sort: number;
}

export interface PositionWithHolders extends Position {
  holders: Profile[];
}

/** Positions in an org, each with the members who hold it. */
export async function listPositions(orgId: string): Promise<PositionWithHolders[]> {
  const [{ data: positions }, { data: holders }] = await Promise.all([
    supabase.from('positions').select('*').eq('org_id', orgId).order('sort'),
    supabase.from('member_positions').select('position_id, profiles(*)').eq('org_id', orgId),
  ]);
  const byPos = new Map<string, Profile[]>();
  (holders ?? []).forEach((h) => {
    const raw = h as unknown as { position_id: string; profiles: Profile | null };
    const arr = byPos.get(raw.position_id) ?? [];
    if (raw.profiles) arr.push(raw.profiles);
    byPos.set(raw.position_id, arr);
  });
  return (positions ?? []).map((p) => ({ ...(p as Position), holders: byPos.get(p.id) ?? [] }));
}

export async function createPosition(orgId: string, name: string, sort: number): Promise<void> {
  const { error } = await supabase.from('positions').insert({ org_id: orgId, name, sort });
  if (error) throw error;
}

export async function renamePosition(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('positions').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deletePosition(id: string): Promise<void> {
  const { error } = await supabase.from('positions').delete().eq('id', id);
  if (error) throw error;
}

export async function assignMemberToPosition(orgId: string, positionId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('member_positions').insert({ org_id: orgId, position_id: positionId, user_id: userId });
  if (error) throw error;
}

export async function unassignMemberFromPosition(positionId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('member_positions').delete().eq('position_id', positionId).eq('user_id', userId);
  if (error) throw error;
}
